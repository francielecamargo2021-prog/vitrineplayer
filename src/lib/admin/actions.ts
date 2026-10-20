"use server";

import { revalidatePath } from "next/cache";
import { userDataClient } from "@/lib/db/data-api";
import { currentUser } from "@/lib/auth/server";
import { hasLocale } from "@/i18n/config";
import type { FormState } from "@/lib/panel/actions";

const decisions = ["approve", "reject", "suspend", "reinstate"] as const;
type Decision = (typeof decisions)[number];
const safeLang = (lang: string) => (hasLocale(lang) ? lang : "pt");
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/** Erros do banco → mensagens curtas (nunca o erro bruto). */
function errorKey(message: string) {
  if (message.includes("note required")) return "Informe o motivo (mínimo de 5 caracteres). Ele será mostrado ao responsável.";
  if (message.includes("invalid transition")) return "Essa decisão não vale para a situação atual. Atualize a página.";
  if (message.includes("not allowed")) return "Sua conta não tem permissão de administrador.";
  return "Não foi possível salvar. Tente de novo.";
}

function readDecision(fd: FormData) {
  const decision = String(fd.get("decision") ?? "") as Decision;
  const note = String(fd.get("note") ?? "").trim().slice(0, 1000);
  return decisions.includes(decision) ? { decision, note: note || null } : null;
}

/** Exige sessão; a permissão de admin é conferida de novo pelo banco (admin_review_*). */
async function client() {
  if (!(await currentUser())) throw new Error("auth");
  const db = await userDataClient();
  if (!db) throw new Error("backend");
  return db;
}

export async function reviewAthlete(lang: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const input = readDecision(fd);
  if (!input || !isUuid(id)) return { error: "Decisão inválida." };
  const db = await client();
  const { error } = await db.rpc("admin_review_athlete", { p_athlete: id, p_decision: input.decision, p_note: input.note });
  if (error) return { error: errorKey(error.message) };
  revalidatePath(`/${safeLang(lang)}/admin`, "layout");
  return { ok: true, message: "Decisão registrada. O responsável será avisado." };
}

export async function reviewOrganization(lang: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const input = readDecision(fd);
  if (!input || input.decision === "reinstate" || !isUuid(id)) return { error: "Decisão inválida." };
  const db = await client();
  const { error } = await db.rpc("admin_review_organization", { p_org: id, p_decision: input.decision, p_note: input.note });
  if (error) return { error: errorKey(error.message) };
  revalidatePath(`/${safeLang(lang)}/admin`, "layout");
  return { ok: true, message: "Decisão registrada." };
}
