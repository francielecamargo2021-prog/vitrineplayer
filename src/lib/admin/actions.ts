"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asUser } from "@/lib/db";
import { currentUser } from "@/lib/auth/server";
import { mfaToken } from "@/lib/auth/mfa";
import { getLimiter } from "@/lib/auth/rate-limit";
import { deleteBlobFiles } from "@/lib/photos/server";
import { hasLocale } from "@/i18n/config";
import type { FormState } from "@/lib/panel/actions";

/**
 * Ações do admin. Cada uma roda como o admin levando a prova do segundo fator; o banco
 * confere papel + segundo fator (is_admin) e as regras de cada decisão, e grava auditoria.
 */
const decisions = ["approve", "reject", "suspend", "reinstate"] as const;
type Decision = (typeof decisions)[number];
const safeLang = (lang: string) => (hasLocale(lang) ? lang : "pt");
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text = (fd: FormData, k: string, max = 1000) => String(fd.get(k) ?? "").trim().slice(0, max);

/** Erros do banco → mensagens curtas (nunca o erro bruto). */
function errorKey(message: string) {
  if (message.includes("note required")) return "Informe o motivo (mínimo de 5 caracteres). Ele fica registrado na auditoria.";
  if (message.includes("invalid transition")) return "Essa decisão não vale para a situação atual. Atualize a página.";
  if (message.includes("invalid settings") || message.includes("invalid quantity")) return "Valores inválidos.";
  if (message.includes("cannot remove owner")) return "O dono da organização não pode ser removido.";
  if (message.includes("not allowed")) return "Sua sessão de administrador não permite esta ação. Entre de novo com o segundo fator.";
  return "Não foi possível salvar. Tente de novo.";
}

async function admin() {
  const user = await currentUser();
  const mfa = await mfaToken();
  if (!user || !mfa) throw new Error("not allowed");
  return { id: user.id, mfa };
}
/** Executa como o admin (com segundo fator) e devolve o estado do formulário. */
async function run(lang: string, fn: (a: { id: string; mfa: string }) => Promise<unknown>, ok: string): Promise<FormState> {
  try {
    await fn(await admin());
  } catch (e) {
    return { error: errorKey(String((e as Error).message)) };
  }
  revalidatePath(`/${safeLang(lang)}/admin`, "layout");
  return { ok: true, message: ok };
}
const sql = (a: { id: string; mfa: string }) => <T,>(fn: Parameters<typeof asUser<T>>[1]) => asUser<T>(a.id, fn, { mfa: a.mfa });

function readDecision(fd: FormData) {
  const decision = String(fd.get("decision") ?? "") as Decision;
  const note = text(fd, "note");
  return decisions.includes(decision) ? { decision, note: note || null } : null;
}

// ---------------------------------------------------------------- revisões
export async function reviewAthlete(lang: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const input = readDecision(fd);
  if (!input || !isUuid(id)) return { error: "Decisão inválida." };
  return run(lang, (a) => sql(a)((q) => q`select admin_review_athlete(${id}::uuid, ${input.decision}, ${input.note})`), "Decisão registrada. O responsável será avisado.");
}

export async function reviewOrganization(lang: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const input = readDecision(fd);
  if (!input || input.decision === "reinstate" || !isUuid(id)) return { error: "Decisão inválida." };
  return run(lang, (a) => sql(a)((q) => q`select admin_review_organization(${id}::uuid, ${input.decision}, ${input.note})`), "Decisão registrada.");
}

// ---------------------------------------------------------------- atletas: correção, moderação, IA
export async function requestCorrection(lang: string, athleteId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  if (!isUuid(athleteId)) return { error: "Atleta inválido." };
  return run(lang, (a) => sql(a)((q) => q`select admin_request_correction(${athleteId}::uuid, ${text(fd, "note")})`), "Pedido de correção enviado à família.");
}

export async function removeMedia(lang: string, mediaId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  if (!isUuid(mediaId)) return { error: "Mídia inválida." };
  let blob: string | null = null;
  const r = await run(lang, async (a) => {
    const [row] = await sql(a)<{ blob: string | null }>((q) => q`select admin_remove_media(${mediaId}::uuid, ${text(fd, "note")}) as blob`);
    blob = row?.blob ?? null;
  }, "Mídia removida. A família foi avisada.");
  if (r?.ok && blob) await deleteBlobFiles([blob]);
  return r;
}

export async function grantAi(lang: string, athleteId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  if (!isUuid(athleteId)) return { error: "Atleta inválido." };
  const n = Number(fd.get("quantity"));
  return run(lang, (a) => sql(a)((q) => q`select admin_ai_grant(${athleteId}::uuid, ${n}, ${text(fd, "note", 300)})`), "Cortesia registrada.");
}

export async function updateAiSettings(lang: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const n = (k: string) => Number(fd.get(k));
  return run(lang, (a) => sql(a)((q) => q`select admin_update_ai_settings(${n("daily")}, ${n("monthly")}, ${n("max30")}, ${n("segment")})`), "Limites da IA atualizados.");
}

// ---------------------------------------------------------------- contas
export async function setAccountSuspended(lang: string, profileId: string, suspend: boolean, _prev: FormState, fd: FormData): Promise<FormState> {
  if (!isUuid(profileId)) return { error: "Conta inválida." };
  return run(lang, (a) => sql(a)((q) => q`select admin_set_account_suspended(${profileId}::uuid, ${suspend}, ${text(fd, "note") || null})`),
    suspend ? "Conta suspensa." : "Conta reativada.");
}

export async function deleteAccountByAdmin(lang: string, profileId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  if (!isUuid(profileId)) return { error: "Conta inválida." };
  if (text(fd, "confirm") !== "EXCLUIR") return { error: "Digite EXCLUIR para confirmar." };
  let blobs: string[] = [];
  let email: string | null = null;
  const r = await run(lang, async (a) => {
    const [p] = await sql(a)<{ email: string | null }>((q) => q`select email from profiles where id = ${profileId}::uuid`);
    email = p?.email ?? null;
    const [row] = await sql(a)<{ blobs: string[] }>((q) => q`select account_delete(${profileId}::uuid, ${text(fd, "note")}) as blobs`);
    blobs = row?.blobs ?? [];
  }, "Conta excluída.");
  if (!r?.ok) return r;
  await deleteBlobFiles(blobs);
  if (email) await getLimiter()?.forgetAccount(String(email).toLowerCase()); // aparelhos reconhecidos e proteção da conta
  redirect(`/${safeLang(lang)}/admin/contas`);
}

// ---------------------------------------------------------------- denúncias, interesses, organizações
export async function resolveReport(lang: string, requestId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  if (!isUuid(requestId)) return { error: "Denúncia inválida." };
  const status = String(fd.get("decision") ?? "");
  if (!["reviewing", "resolved", "dismissed"].includes(status)) return { error: "Decisão inválida." };
  const suspend = fd.get("suspend_org") === "on";
  return run(lang, (a) => sql(a)((q) => q`select admin_resolve_report(${requestId}::uuid, ${status}, ${text(fd, "note") || null}, ${suspend})`), "Denúncia atualizada.");
}

export async function cancelInterest(lang: string, requestId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  if (!isUuid(requestId)) return { error: "Interesse inválido." };
  return run(lang, (a) => sql(a)((q) => q`select admin_cancel_interest(${requestId}::uuid, ${text(fd, "note")})`), "Interesse cancelado.");
}

export async function removeMember(lang: string, orgId: string, profileId: string, _prev: FormState): Promise<FormState> {
  void _prev;
  if (!isUuid(orgId) || !isUuid(profileId)) return { error: "Dados inválidos." };
  return run(lang, (a) => sql(a)((q) => q`select org_remove_member(${orgId}::uuid, ${profileId}::uuid)`), "Membro removido.");
}

export async function revokeInvite(lang: string, inviteId: string, _prev: FormState): Promise<FormState> {
  void _prev;
  if (!isUuid(inviteId)) return { error: "Convite inválido." };
  return run(lang, (a) => sql(a)((q) => q`select org_invite_revoke(${inviteId}::uuid)`), "Convite cancelado.");
}

// ---------------------------------------------------------------- configurações
/** Limites do portal (fichas por dia, interesses por mês, prazo). O banco confere o admin. */
export async function updatePortalSettings(lang: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const n = (k: string) => Number(fd.get(k));
  const views = n("views"), interests = n("interests"), expiry = n("expiry");
  const ok = (v: number, max: number) => Number.isInteger(v) && v >= 1 && v <= max;
  if (!ok(views, 10000) || !ok(interests, 1000) || !ok(expiry, 365)) return { error: "Valores inválidos (fichas 1–10000, interesses 1–1000, prazo 1–365 dias)." };
  return run(lang, (a) => sql(a)((q) => q`select admin_update_portal_settings(${views}, ${interests}, ${expiry})`), "Limites atualizados.");
}
