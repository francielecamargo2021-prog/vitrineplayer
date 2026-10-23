"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asUser } from "@/lib/db";
import { currentUser } from "@/lib/auth/server";
import { hasLocale } from "@/i18n/config";

/**
 * Ações do portal. Cada uma roda COMO o profissional (asUser): as políticas e as
 * funções do banco conferem organização aprovada, atleta visível, bloqueios e limites.
 */
export type PortalState = { ok?: boolean; error?: string; message?: string } | undefined;

const safeLang = (lang: string) => (hasLocale(lang) ? lang : "pt");
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

async function uid(lang: string) {
  const user = await currentUser();
  if (!user || !user.emailVerified) redirect(`/${safeLang(lang)}/entrar`);
  return user.id;
}
const refresh = (lang: string) => revalidatePath(`/${safeLang(lang)}/portal`, "layout");

export async function toggleFavorite(lang: string, athleteId: string, on: boolean) {
  if (!isUuid(athleteId)) return { error: "invalid" };
  const me = await uid(lang);
  try {
    if (on) {
      await asUser(me, (q) => q`insert into pro_favorites (profile_id, athlete_id) values (${me}, ${athleteId}) on conflict do nothing`);
    } else {
      await asUser(me, (q) => q`delete from pro_favorites where profile_id = ${me} and athlete_id = ${athleteId}`);
    }
  } catch {
    return { error: "save" };
  }
  refresh(lang);
  return { ok: true };
}

export async function createList(lang: string, _prev: PortalState, fd: FormData): Promise<PortalState> {
  const name = String(fd.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!name) return { error: "required" };
  const me = await uid(lang);
  try {
    await asUser(me, (q) => q`insert into pro_lists (organization_id, name, created_by) values (my_pro_org(), ${name}, ${me})`);
  } catch {
    return { error: "save" };
  }
  refresh(lang);
  return { ok: true };
}

export async function deleteList(lang: string, listId: string) {
  if (!isUuid(listId)) return;
  const me = await uid(lang);
  await asUser(me, (q) => q`delete from pro_lists where id = ${listId} and created_by = ${me}`);
  refresh(lang);
  redirect(`/${safeLang(lang)}/portal/listas`);
}

export async function setInList(lang: string, listId: string, athleteId: string, on: boolean) {
  if (!isUuid(listId) || !isUuid(athleteId)) return { error: "invalid" };
  const me = await uid(lang);
  try {
    if (on) {
      await asUser(me, (q) => q`insert into pro_list_items (list_id, athlete_id, added_by) values (${listId}, ${athleteId}, ${me}) on conflict do nothing`);
    } else {
      await asUser(me, (q) => q`delete from pro_list_items where list_id = ${listId} and athlete_id = ${athleteId}`);
    }
  } catch {
    return { error: "save" };
  }
  refresh(lang);
  return { ok: true };
}

/** Interesse: vai direto ao responsável. Nenhum dado da família volta para o profissional. */
export async function sendInterest(lang: string, athleteId: string, _prev: PortalState, fd: FormData): Promise<PortalState> {
  if (!isUuid(athleteId)) return { error: "generic" };
  const message = String(fd.get("message") ?? "").trim();
  if (message.length < 10 || message.length > 500) return { error: "length" };
  const me = await uid(lang);
  try {
    await asUser(me, (q) => q`select pro_send_interest(${athleteId}::uuid, ${message})`);
    await advanceStage(me, athleteId, "interest", ["watching", "evaluated"]);
  } catch (e) {
    const m = String((e as Error).message);
    const key = /message length/.test(m) ? "length" : /message contact/.test(m) ? "contact" : /already open/.test(m) ? "open"
      : /recently answered/.test(m) ? "answered" : /monthly limit/.test(m) ? "monthly" : "generic";
    return { error: key };
  }
  refresh(lang);
  return { ok: true };
}

// ---------------------------------------------------------------- área de trabalho (B1)
/** O funil só anda para a frente sozinho: cria a etapa ou avança a partir das anteriores. */
async function advanceStage(me: string, athleteId: string, stage: string, from: string[]) {
  await asUser(me, (q) => q`insert into pro_tracking (organization_id, athlete_id, stage, updated_by) values (my_pro_org(), ${athleteId}, ${stage}, ${me})
    on conflict (organization_id, athlete_id) do update set stage = excluded.stage, updated_by = excluded.updated_by, updated_at = now()
    where pro_tracking.stage = any (${from}::text[])`).catch(() => {});
}
const STAGES = ["watching", "evaluated", "interest", "talking", "archived"];

export async function addNote(lang: string, athleteId: string, _prev: PortalState, fd: FormData): Promise<PortalState> {
  if (!isUuid(athleteId)) return { error: "generic" };
  const body = String(fd.get("body") ?? "").trim().slice(0, 2000);
  const tags = String(fd.get("tags") ?? "").split(",").map((t) => t.trim().toLowerCase().slice(0, 30)).filter(Boolean).slice(0, 8);
  if (!body) return { error: "required" };
  const me = await uid(lang);
  try {
    await asUser(me, (q) => q`insert into pro_notes (organization_id, athlete_id, author_id, body, tags) values (my_pro_org(), ${athleteId}, ${me}, ${body}, ${tags}::text[])`);
  } catch {
    return { error: "save" };
  }
  refresh(lang);
  return { ok: true, message: String(Date.now()) };
}

export async function deleteNote(lang: string, noteId: string) {
  if (!isUuid(noteId)) return;
  const me = await uid(lang);
  await asUser(me, (q) => q`delete from pro_notes where id = ${noteId} and author_id = ${me}`).catch(() => {});
  refresh(lang);
}

/** Avaliação pela rubrica da posição: notas 1–5 só nos fundamentos observados. */
export async function addEvaluation(lang: string, athleteId: string, group: string, rubric: string, keys: string[], _prev: PortalState, fd: FormData): Promise<PortalState> {
  if (!isUuid(athleteId)) return { error: "generic" };
  const scores: Record<string, number> = {};
  for (const k of keys) {
    const v = Number(fd.get(`s_${k}`));
    if ([1, 2, 3, 4, 5].includes(v)) scores[k] = v;
  }
  // sem fundamentos (6 a 10 anos): só observação escrita, sem notas
  const formative = keys.length === 0;
  if (!formative && !Object.keys(scores).length) return { error: "scores" };
  if (formative && String(fd.get("observation") ?? "").trim().length < 10) return { error: "required" };
  const context = ["video", "live", "training", "other"].includes(String(fd.get("context"))) ? String(fd.get("context")) : null;
  const media = String(fd.get("media") ?? "");
  const minuteRaw = String(fd.get("minute") ?? "").trim();
  const minute = minuteRaw === "" ? null : Number(minuteRaw);
  if (minute !== null && (!Number.isInteger(minute) || minute < 0 || minute > 200)) return { error: "minute" };
  const observation = String(fd.get("observation") ?? "").trim().slice(0, 2000) || null;
  const me = await uid(lang);
  try {
    await asUser(me, (q) => q`insert into scout_evaluations (organization_id, athlete_id, author_id, rubric_version, position_group, scores, media_id, video_minute, context, observation)
      values (my_pro_org(), ${athleteId}, ${me}, ${rubric}, ${group}, ${formative ? null : JSON.stringify(scores)}::jsonb, ${isUuid(media) ? media : null}, ${minute}, ${context}, ${observation})`);
    await advanceStage(me, athleteId, "evaluated", ["watching"]);
  } catch {
    return { error: "save" };
  }
  refresh(lang);
  return { ok: true, message: String(Date.now()) };
}

export async function deleteEvaluation(lang: string, evaluationId: string) {
  if (!isUuid(evaluationId)) return;
  const me = await uid(lang);
  await asUser(me, (q) => q`delete from scout_evaluations where id = ${evaluationId} and author_id = ${me}`).catch(() => {});
  refresh(lang);
}

export async function setStage(lang: string, athleteId: string, stage: string) {
  if (!isUuid(athleteId)) return { error: "invalid" };
  const me = await uid(lang);
  try {
    if (stage === "") {
      await asUser(me, (q) => q`delete from pro_tracking where organization_id = my_pro_org() and athlete_id = ${athleteId}`);
    } else {
      if (!STAGES.includes(stage)) return { error: "invalid" };
      await asUser(me, (q) => q`insert into pro_tracking (organization_id, athlete_id, stage, updated_by) values (my_pro_org(), ${athleteId}, ${stage}, ${me})
        on conflict (organization_id, athlete_id) do update set stage = excluded.stage, updated_by = excluded.updated_by, updated_at = now()`);
    }
  } catch {
    return { error: "save" };
  }
  refresh(lang);
  return { ok: true };
}

// ---------------------------------------------------------------- equipe (B2)
export type InviteState = { ok?: boolean; error?: string; link?: string } | undefined;

/** Dono gera um convite de uso único (7 dias). O link aparece só uma vez. */
export async function createInvite(lang: string, _prev: InviteState): Promise<InviteState> {
  void _prev;
  const me = await uid(lang);
  try {
    const [r] = await asUser<{ token: string }>(me, (q) => q`select org_invite_create() as token`);
    refresh(lang);
    return { ok: true, link: `/${safeLang(lang)}/profissional/convite/${r.token}` };
  } catch (e) {
    return { error: /team full/.test(String((e as Error).message)) ? "full" : "generic" };
  }
}

export async function revokeTeamInvite(lang: string, inviteId: string) {
  if (!isUuid(inviteId)) return;
  const me = await uid(lang);
  await asUser(me, (q) => q`select org_invite_revoke(${inviteId}::uuid)`).catch(() => {});
  refresh(lang);
}

export async function removeTeamMember(lang: string, profileId: string) {
  if (!isUuid(profileId)) return;
  const me = await uid(lang);
  await asUser(me, (q) => q`select org_remove_member(my_pro_org(), ${profileId}::uuid)`).catch(() => {});
  refresh(lang);
}
