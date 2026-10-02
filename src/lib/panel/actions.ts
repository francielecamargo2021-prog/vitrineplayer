"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  availabilityAnswers, categories, countries, feet, positions, seekingKinds, sexes, traitKeys, videoTypes, youtubeId,
  PHOTO_BUCKET, type Availability, type Position,
} from "@/domain/athlete";
import { hasLocale } from "@/i18n/config";
import type { Database } from "@/lib/supabase/database.types";
import { stepSlugs, type StepSlug } from "./steps";

export type FormState = { ok?: boolean; error?: string; message?: string } | undefined;
type AthleteUpdate = Database["public"]["Tables"]["athletes"]["Update"];

const CONSENT_VERSION = "2026-10";

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

async function authed() {
  const supabase = await createClient();
  if (!supabase) throw new Error("backend");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("auth");
  return { supabase, user };
}
const refresh = (lang: string) => revalidatePath(`/${safeLang(lang)}/painel`, "layout");

// ---------------------------------------------------------------- conta
export async function signUp(lang: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const supabase = await createClient();
  if (!supabase) return { error: "backend" };
  const fullName = str(fd, "full_name");
  const email = str(fd, "email").toLowerCase();
  const whatsapp = str(fd, "whatsapp").replace(/[^\d+]/g, "");
  const country = oneOf(str(fd, "country"), countries);
  const password = String(fd.get("password") ?? "");
  if (!fullName || !email || !whatsapp || !password || !country) return { error: "required" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "email" };
  if (!/^\+?\d{10,15}$/.test(whatsapp)) return { error: "whatsapp" };
  if (password.length < 8) return { error: "password" };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "mismatch" };
  const consents = ["terms", "privacy", "guardian_declaration", "no_guarantee"];
  if (!consents.every((c) => fd.get(c) === "on")) return { error: "consents" };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const l = safeLang(lang);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName, whatsapp, country, locale: l === "es" ? "es" : "pt-BR",
        consents, consent_version: CONSENT_VERSION, consent_ip: ip, consent_ua: h.get("user-agent") ?? "",
      },
    },
  });
  if (error) return { error: /registered|exists/i.test(error.message) ? "exists" : "generic" };
  if (!data.session) return { ok: true, message: "checkEmail" };
  redirect(`/${l}/painel/atleta/novo`);
}

export async function signIn(lang: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const supabase = await createClient();
  if (!supabase) return { error: "backend" };
  const { error } = await supabase.auth.signInWithPassword({ email: str(fd, "email").toLowerCase(), password: String(fd.get("password") ?? "") });
  if (error) return { error: "invalid" };
  redirect(`/${safeLang(lang)}/painel`);
}

export async function signOut(lang: string) {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect(`/${safeLang(lang)}/entrar`);
}

// ---------------------------------------------------------------- atleta
export async function createAthlete(lang: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await authed();
  const birth = str(fd, "birth_date");
  const relation = oneOf(str(fd, "relation"), ["mother", "father", "legal_guardian", "self", "other"] as const) ?? "legal_guardian";
  const country = oneOf(str(fd, "country"), countries);
  if (str(fd, "full_name").length < 3 || !isDate(birth) || !country) return { error: "required" };
  const { data, error } = await supabase.rpc("create_athlete", {
    p_full_name: str(fd, "full_name"), p_sport_name: str(fd, "sport_name"), p_birth_date: birth,
    p_country: country,
    p_relation: relation,
  });
  if (error || !data) return { error: "generic" };
  refresh(lang);
  redirect(`/${safeLang(lang)}/painel/atleta/${data}/editar/dados`);
}

/** Salva uma etapa do perfil (rascunho progressivo). `intent=next` avança. */
export async function saveStep(lang: string, id: string, step: StepSlug, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await authed();
  let patch: AthleteUpdate = {};

  if (step === "dados") {
    const birth = str(fd, "birth_date");
    const country = oneOf(str(fd, "country"), countries);
    if (str(fd, "full_name").length < 3 || !isDate(birth) || !country) return { error: "required" };
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
      supabase.from("athlete_clubs").delete().eq("athlete_id", id),
      supabase.from("athlete_achievements").delete().eq("athlete_id", id),
    ]);
    if (dc.error || da.error) return { error: "save" };
    const [ic, ia] = await Promise.all([
      clubs.length ? supabase.from("athlete_clubs").insert(clubs) : null,
      achievements.length ? supabase.from("athlete_achievements").insert(achievements) : null,
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
    const { data, error } = await supabase.from("athletes").update(patch).eq("id", id).select("id");
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
const ownPath = (id: string, path: string) => new RegExp(`^${id}/[A-Za-z0-9_-]{8,64}\\.webp$`).test(path);

export async function registerPhoto(lang: string, id: string, path: string, width: number, height: number) {
  const { supabase } = await authed();
  if (!ownPath(id, path)) return { error: "path" };
  const { data: current } = await supabase.from("athlete_media").select("id, is_primary").eq("athlete_id", id).eq("kind", "photo");
  const { error } = await supabase.from("athlete_media").insert({
    athlete_id: id, kind: "photo", storage_path: path, width, height,
    is_primary: !(current ?? []).some((p) => p.is_primary), position: (current ?? []).length,
  });
  if (error) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    return { error: /limit/.test(error.message) ? "full" : "save" };
  }
  refresh(lang);
  return { ok: true };
}

export async function replacePhoto(lang: string, id: string, mediaId: string, path: string, width: number, height: number) {
  const { supabase } = await authed();
  if (!ownPath(id, path)) return { error: "path" };
  const { data: old } = await supabase.from("athlete_media").select("storage_path").eq("id", mediaId).eq("athlete_id", id).single();
  if (!old?.storage_path) return { error: "save" };
  const { error } = await supabase.from("athlete_media")
    .update({ storage_path: path, width, height, focal_x: 0.5, focal_y: 0.5, zoom: 1 }).eq("id", mediaId);
  if (error) return { error: "save" };
  await supabase.storage.from(PHOTO_BUCKET).remove([old.storage_path]);
  refresh(lang);
  return { ok: true };
}

export async function deletePhoto(lang: string, id: string, mediaId: string) {
  const { supabase } = await authed();
  const { data: row } = await supabase.from("athlete_media").select("storage_path, is_primary").eq("id", mediaId).eq("athlete_id", id).single();
  if (!row?.storage_path) return { error: "save" };
  const { error } = await supabase.from("athlete_media").delete().eq("id", mediaId);
  if (error) return { error: "save" };
  await supabase.storage.from(PHOTO_BUCKET).remove([row.storage_path]);
  if (row.is_primary) {
    const { data: next } = await supabase.from("athlete_media").select("id").eq("athlete_id", id).eq("kind", "photo").order("position").limit(1);
    if (next?.[0]) await supabase.rpc("set_primary_photo", { p_media: next[0].id });
  }
  refresh(lang);
  return { ok: true };
}

export async function setPrimaryPhoto(lang: string, mediaId: string) {
  const { supabase } = await authed();
  const { error } = await supabase.rpc("set_primary_photo", { p_media: mediaId });
  refresh(lang);
  return error ? { error: "save" } : { ok: true };
}

export async function setFraming(lang: string, mediaId: string, x: number, y: number, zoom: number) {
  const { supabase } = await authed();
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : a));
  const { error } = await supabase.from("athlete_media")
    .update({ focal_x: clamp(x, 0, 1), focal_y: clamp(y, 0, 1), zoom: clamp(zoom, 1, 3) }).eq("id", mediaId).eq("kind", "photo");
  refresh(lang);
  return error ? { error: "save" } : { ok: true };
}

export async function movePhoto(lang: string, id: string, mediaId: string, dir: -1 | 1) {
  const { supabase } = await authed();
  const { data } = await supabase.from("athlete_media").select("id").eq("athlete_id", id).eq("kind", "photo").order("position").order("created_at");
  const list = (data ?? []).map((r) => r.id);
  const i = list.indexOf(mediaId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  [list[i], list[j]] = [list[j], list[i]];
  await Promise.all(list.map((mid, position) => supabase.from("athlete_media").update({ position }).eq("id", mid)));
  refresh(lang);
  return { ok: true };
}

// ---------------------------------------------------------------- vídeos (links do YouTube)
export async function addVideo(lang: string, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await authed();
  const url = str(fd, "url");
  const ytId = youtubeId(url);
  if (!ytId) return { error: "invalid" };
  const title = str(fd, "title").slice(0, 120) || null;
  const { count } = await supabase.from("athlete_media").select("id", { count: "exact", head: true }).eq("athlete_id", id).eq("kind", "youtube");
  if ((count ?? 0) >= 20) return { error: "save" };
  const { error } = await supabase.from("athlete_media").insert({
    athlete_id: id, kind: "youtube", url: `https://www.youtube.com/watch?v=${ytId}`, external_id: ytId, title,
    description: str(fd, "description").slice(0, 280) || null, video_type: oneOf(str(fd, "video_type"), videoTypes) ?? "other",
    position: count ?? 0,
  });
  if (error) return { error: "save" };
  refresh(lang);
  return { ok: true };
}

export async function removeVideo(lang: string, id: string, mediaId: string) {
  const { supabase } = await authed();
  await supabase.from("athlete_media").delete().eq("id", mediaId).eq("athlete_id", id).eq("kind", "youtube");
  refresh(lang);
}

// ---------------------------------------------------------------- privacidade (bloqueio por organização)
export async function searchOrganizations(query: string) {
  const { supabase } = await authed();
  if (query.trim().length < 3) return [];
  const { data } = await supabase.rpc("search_organizations", { p_query: query.slice(0, 60) });
  return data ?? [];
}

export async function blockOrganization(lang: string, id: string, orgId: string) {
  const { supabase, user } = await authed();
  const { error } = await supabase.from("athlete_org_blocks").upsert({ athlete_id: id, organization_id: orgId, created_by: user.id }, { ignoreDuplicates: true });
  refresh(lang);
  return error ? { error: "save" } : { ok: true };
}

export async function unblockOrganization(lang: string, id: string, orgId: string) {
  const { supabase } = await authed();
  await supabase.from("athlete_org_blocks").delete().eq("athlete_id", id).eq("organization_id", orgId);
  refresh(lang);
}

// ---------------------------------------------------------------- publicação e visibilidade
/** Rascunho → aguardando pagamento. A confirmação do pagamento só vem do gateway (webhook). */
export async function requestPayment(lang: string, id: string) {
  const { supabase } = await authed();
  await supabase.from("athletes").update({ status: "pending_payment" }).eq("id", id).eq("status", "draft");
  refresh(lang);
}

export async function backToDraft(lang: string, id: string) {
  const { supabase } = await authed();
  await supabase.from("athletes").update({ status: "draft" }).eq("id", id).eq("status", "pending_payment");
  refresh(lang);
}

export async function resubmit(lang: string, id: string) {
  const { supabase } = await authed();
  await supabase.from("athletes").update({ status: "in_review" }).eq("id", id).eq("status", "rejected");
  refresh(lang);
}

export async function setVisibility(lang: string, id: string, fd: FormData) {
  const { supabase } = await authed();
  const v = oneOf(str(fd, "visibility"), ["active", "paused", "hidden"] as const);
  if (v) await supabase.from("athletes").update({ visibility: v }).eq("id", id);
  refresh(lang);
}
