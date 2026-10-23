"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { userDataClient } from "@/lib/db/data-api";
import { currentUser } from "@/lib/auth/server";
import { removePhoto } from "@/lib/photos/server";
import { asUser } from "@/lib/db";
import {
  availabilityAnswers, ageOn, categories, countries, feet, modalities, positions, seekingKinds, sexes, traitKeys, videoTypes, youtubeId,
  ADULT_AGE, VIDEO_LIMIT, inAgeRange,
  type Availability, type Position,
} from "@/domain/athlete";
import { hasLocale } from "@/i18n/config";
import type { Database } from "@/lib/db/database.types";
import { stepSlugs, type StepSlug } from "./steps";

export type FormState = { ok?: boolean; error?: string; message?: string } | undefined;
type AthleteUpdate = Database["public"]["Tables"]["athletes"]["Update"];


// ---------------------------------------------------------------- utilidades
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => str(fd, k) || null;
const all = (fd: FormData, k: string) => fd.getAll(k).map((v) => String(v).trim());
const oneOf = <T extends string>(v: string, list: readonly T[]) => ((list as readonly string[]).includes(v) ? (v as T) : null);
const int = (v: string, min: number, max: number) => {
  const n = Number(v);
  return v && Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const month = (v: string) => (/^\d{4}-\d{2}$/.test(v) ? `${v}-01` : isDate(v) ? v : null);
const yesNo = (v: string) => (v === "yes" ? true : v === "no" ? false : null);
const safeLang = (lang: string) => (hasLocale(lang) ? lang : "pt");

/** Exige sessão: devolve o usuário e o cliente de dados com o JWT dele (RLS no banco). */
async function authed() {
  const user = await currentUser();
  if (!user) throw new Error("auth");
  const db = await userDataClient();
  if (!db) throw new Error("backend");
  return { db, user };
}
const refresh = (lang: string) => revalidatePath(`/${safeLang(lang)}/painel`, "layout");

// ---------------------------------------------------------------- atleta
export async function createAthlete(lang: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { db } = await authed();
  const birth = str(fd, "birth_date");
  const relation = oneOf(str(fd, "relation"), ["mother", "father", "legal_guardian", "self", "other"] as const) ?? "legal_guardian";
  const country = oneOf(str(fd, "country"), countries);
  if (str(fd, "full_name").length < 3 || !isDate(birth) || !country) return { error: "required" };
  if (!inAgeRange(birth)) return { error: "ageRange" };
  if (relation === "self" && ageOn(birth) < ADULT_AGE) return { error: "minorSelf" };
  const { data, error } = await db.rpc("create_athlete", {
    p_full_name: str(fd, "full_name"), p_sport_name: str(fd, "sport_name"), p_birth_date: birth,
    p_country: country,
    p_relation: relation,
  });
  if (error || !data) return { error: /minor needs guardian/.test(error?.message ?? "") ? "minorSelf" : /age out of range/.test(error?.message ?? "") ? "ageRange" : "generic" };
  refresh(lang);
  redirect(`/${safeLang(lang)}/painel/atleta/${data}/editar/dados`);
}

/** Salva uma etapa do perfil (rascunho progressivo). `intent=next` avança. */
export async function saveStep(lang: string, id: string, step: StepSlug, _prev: FormState, fd: FormData): Promise<FormState> {
  const { db } = await authed();
  let patch: AthleteUpdate = {};

  if (step === "dados") {
    const birth = str(fd, "birth_date");
    const country = oneOf(str(fd, "country"), countries);
    if (str(fd, "full_name").length < 3 || !isDate(birth) || !country) return { error: "required" };
    if (!inAgeRange(birth)) return { error: "ageRange" };
    const nationality = oneOf(str(fd, "nationality"), countries);
    patch = {
      full_name: str(fd, "full_name"), sport_name: opt(fd, "sport_name"), birth_date: birth,
      sex: oneOf(str(fd, "sex"), sexes),
      nationality,
      other_citizenships: [...new Set(all(fd, "other_citizenships"))].filter((c) => c !== nationality && (countries as string[]).includes(c)).slice(0, 3),
      valid_passport: yesNo(str(fd, "valid_passport")),
      country, state: opt(fd, "state"), city: opt(fd, "city"),
    };
  }

  if (step === "fisico") {
    patch = {
      height_cm: int(str(fd, "height_cm"), 80, 230), weight_kg: int(str(fd, "weight_kg"), 15, 150),
      measured_at: isDate(str(fd, "measured_at")) ? str(fd, "measured_at") : null, foot: oneOf(str(fd, "foot"), feet),
    };
  }

  if (step === "futebol") {
    const primary = oneOf(str(fd, "primary_position"), positions);
    const federated = yesNo(str(fd, "federated"));
    patch = {
      modality: oneOf(str(fd, "modality"), modalities),
      primary_position: primary,
      secondary_positions: [...new Set(all(fd, "secondary_positions"))].map((p) => oneOf(p, positions)).filter((p): p is Position => !!p && p !== primary).slice(0, 3),
      category: oneOf(str(fd, "category"), categories), current_club: opt(fd, "current_club"),
      current_club_since: month(str(fd, "current_club_since")), federated: federated ?? false,
      federation: federated ? opt(fd, "federation") : null,
      competitions: str(fd, "competitions").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 30),
      experiences: opt(fd, "experiences"),
    };
    const clubs = all(fd, "club").map((club, i) => ({ club, from: all(fd, "club_from")[i], to: all(fd, "club_to")[i] }))
      .filter((c) => c.club).slice(0, 20)
      .map((c) => ({ athlete_id: id, club: c.club, started_on: month(c.from ?? ""), ended_on: month(c.to ?? "") }));
    const achievements = all(fd, "ach_title").map((title, i) => ({ title, competition: all(fd, "ach_competition")[i], year: all(fd, "ach_year")[i] }))
      .filter((a) => a.title.length >= 2).slice(0, 30)
      .map((a, i) => ({ athlete_id: id, title: a.title, competition: a.competition || null, year: int(a.year ?? "", 1990, 2100), position: i }));
    const [dc, da] = await Promise.all([
      db.from("athlete_clubs").delete().eq("athlete_id", id),
      db.from("athlete_achievements").delete().eq("athlete_id", id),
    ]);
    if (dc.error || da.error) return { error: "save" };
    const [ic, ia] = await Promise.all([
      clubs.length ? db.from("athlete_clubs").insert(clubs) : null,
      achievements.length ? db.from("athlete_achievements").insert(achievements) : null,
    ]);
    if (ic?.error || ia?.error) return { error: "save" };
  }

  if (step === "perfil") {
    patch = { traits: [...new Set(all(fd, "traits"))].filter((t) => (traitKeys as readonly string[]).includes(t)).slice(0, 8), bio: opt(fd, "bio") };
  }

  if (step === "disponibilidade") {
    const ans = (k: string) => oneOf<Availability>(str(fd, k), availabilityAnswers);
    patch = {
      available: yesNo(str(fd, "available")), travel: ans("travel"), relocate_city: ans("relocate_city"),
      relocate_state: ans("relocate_state"), relocate_abroad: ans("relocate_abroad"),
      seeking: [...new Set(all(fd, "seeking"))].map((s) => oneOf(s, seekingKinds)).filter((s) => s !== null),
      goals: opt(fd, "goals"),
    };
  }

  if (Object.keys(patch).length) {
    const { data, error } = await db.from("athletes").update(patch).eq("id", id).select("id");
    if (error && /minor needs guardian/.test(error.message)) return { error: "minorSelf" };
    if (error || !data?.length) return { error: "save" };
  }
  refresh(lang);
  if (fd.get("intent") === "next") {
    const next = stepSlugs[stepSlugs.indexOf(step) + 1];
    redirect(`/${safeLang(lang)}/painel/atleta/${id}/${next ? `editar/${next}` : ""}`);
  }
  return { ok: true };
}

// ---------------------------------------------------------------- fotos
// Envio e substituição: POST /api/fotos (arquivo recodificado no servidor, Blob privado).
// Exclusão: registro + arquivo, só se o banco permitir ao usuário (RLS).
export async function deletePhoto(lang: string, id: string, mediaId: string) {
  const { user } = await authed();
  try {
    await removePhoto(user.id, id, mediaId);
  } catch (e) {
    console.error("[fotos] excluir:", (e as Error).message);
    return { error: "save" };
  }
  refresh(lang);
  return { ok: true };
}

export async function setPrimaryPhoto(lang: string, mediaId: string) {
  const { db } = await authed();
  const { error } = await db.rpc("set_primary_photo", { p_media: mediaId });
  refresh(lang);
  return error ? { error: "save" } : { ok: true };
}

export async function setFraming(lang: string, mediaId: string, x: number, y: number, zoom: number) {
  const { db } = await authed();
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : a));
  const { error } = await db.from("athlete_media")
    .update({ focal_x: clamp(x, 0, 1), focal_y: clamp(y, 0, 1), zoom: clamp(zoom, 1, 3) }).eq("id", mediaId).eq("kind", "photo");
  refresh(lang);
  return error ? { error: "save" } : { ok: true };
}

export async function movePhoto(lang: string, id: string, mediaId: string, dir: -1 | 1) {
  const { db } = await authed();
  const { data } = await db.from("athlete_media").select("id").eq("athlete_id", id).eq("kind", "photo").order("position").order("created_at");
  const list = (data ?? []).map((r) => r.id);
  const i = list.indexOf(mediaId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  [list[i], list[j]] = [list[j], list[i]];
  await Promise.all(list.map((mid, position) => db.from("athlete_media").update({ position }).eq("id", mid)));
  refresh(lang);
  return { ok: true };
}

// ---------------------------------------------------------------- vídeos (links do YouTube)
export async function addVideo(lang: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { db } = await authed();
  const url = str(fd, "url");
  const ytId = youtubeId(url);
  if (!ytId) return { error: "invalid" };
  const title = str(fd, "title").slice(0, 120) || null;
  const { count } = await db.from("athlete_media").select("id", { count: "exact", head: true }).eq("athlete_id", id).eq("kind", "youtube");
  if ((count ?? 0) >= VIDEO_LIMIT) return { error: "full" };
  const { error } = await db.from("athlete_media").insert({
    athlete_id: id, kind: "youtube", url: `https://www.youtube.com/watch?v=${ytId}`, external_id: ytId, title,
    description: str(fd, "description").slice(0, 280) || null, video_type: oneOf(str(fd, "video_type"), videoTypes) ?? "other",
    position: count ?? 0,
  });
  if (error) return { error: "save" };
  refresh(lang);
  return { ok: true };
}

export async function removeVideo(lang: string, id: string, mediaId: string) {
  const { db } = await authed();
  await db.from("athlete_media").delete().eq("id", mediaId).eq("athlete_id", id).eq("kind", "youtube");
  refresh(lang);
}

// ---------------------------------------------------------------- privacidade (bloqueio por organização)
export async function searchOrganizations(query: string) {
  const { db } = await authed();
  if (query.trim().length < 3) return [];
  const { data } = await db.rpc("search_organizations", { p_query: query.slice(0, 60) });
  return data ?? [];
}

export async function blockOrganization(lang: string, id: string, orgId: string) {
  const { db, user } = await authed();
  const { error } = await db.from("athlete_org_blocks").upsert({ athlete_id: id, organization_id: orgId, created_by: user.id }, { ignoreDuplicates: true });
  refresh(lang);
  return error ? { error: "save" } : { ok: true };
}

export async function unblockOrganization(lang: string, id: string, orgId: string) {
  const { db } = await authed();
  await db.from("athlete_org_blocks").delete().eq("athlete_id", id).eq("organization_id", orgId);
  refresh(lang);
}

// ---------------------------------------------------------------- publicação (gratuita) e visibilidade
/**
 * Envia o perfil para a revisão da equipe — sem pagamento (cadastro gratuito, 0007).
 * O banco exige posição, modalidade e categoria e só aceita rascunho/rejeitado → revisão.
 * Aprovar continua exclusivo do admin.
 */
export async function submitForReview(lang: string, id: string) {
  const { db } = await authed();
  const { data, error } = await db.from("athletes").update({ status: "in_review" })
    .eq("id", id).in("status", ["draft", "pending_payment", "rejected"]).select("id");
  refresh(lang);
  if (error || !data?.length) {
    redirect(`/${safeLang(lang)}/painel/atleta/${id}/editar/publicacao?envio=${error && /incompleto/.test(error.message) ? "incompleto" : "erro"}`);
  }
}

/** Desiste do envio: em revisão (ou "aguardando pagamento", legado) → rascunho. */
export async function withdrawFromReview(lang: string, id: string) {
  const { db } = await authed();
  await db.from("athletes").update({ status: "draft" }).eq("id", id).in("status", ["in_review", "pending_payment"]);
  refresh(lang);
}

export async function setVisibility(lang: string, id: string, fd: FormData) {
  const { db } = await authed();
  const v = oneOf(str(fd, "visibility"), ["active", "paused", "hidden"] as const);
  if (v) await db.from("athletes").update({ visibility: v }).eq("id", id);
  refresh(lang);
}

// ---------------------------------------------------------------- interesses recebidos
/** Resposta da família a um interesse: aceitar, recusar, bloquear ou denunciar (o banco confere o vínculo). */
export async function respondInterest(lang: string, requestId: string, action: "accept" | "decline" | "block" | "report", reason?: string) {
  const { user } = await authed();
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || !["accept", "decline", "block", "report"].includes(action)) return { error: "generic" };
  const r = (reason ?? "").trim().slice(0, 500);
  if (action === "report" && r.length < 5) return { error: "reason" };
  try {
    await asUser(user.id, (q) => q`select respond_interest(${requestId}::uuid, ${action}, ${r || null})`);
  } catch (e) {
    return { error: /reason required/.test(String((e as Error).message)) ? "reason" : "generic" };
  }
  revalidatePath(`/${hasLocale(lang) ? lang : "pt"}/painel`, "layout");
  return { ok: true };
}

/** A família marca um pedido de correção da equipe como resolvido. */
export async function resolveCorrection(lang: string, id: string) {
  const { user } = await authed();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await asUser(user.id, (q) => q`select resolve_correction(${id}::uuid)`).catch(() => {});
  revalidatePath(`/${hasLocale(lang) ? lang : "pt"}/painel`, "layout");
}
