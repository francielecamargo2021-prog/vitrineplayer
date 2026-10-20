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
  } catch (e) {
    const m = String((e as Error).message);
    const key = /message length/.test(m) ? "length" : /message contact/.test(m) ? "contact" : /already open/.test(m) ? "open"
      : /recently answered/.test(m) ? "answered" : /monthly limit/.test(m) ? "monthly" : "generic";
    return { error: key };
  }
  refresh(lang);
  return { ok: true };
}
