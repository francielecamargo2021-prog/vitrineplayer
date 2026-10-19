import "server-only";
import { notFound, redirect } from "next/navigation";
import { getSession, signedPhotoUrls } from "@/lib/panel/data";
import type { ServerClient } from "@/lib/supabase/server";
import type { AthleteBundle, AthleteStatus } from "@/domain/athlete";
import type { Database } from "@/lib/supabase/database.types";

export type OrgStatus = Database["public"]["Enums"]["review_status"];
export const athleteStatuses: AthleteStatus[] = ["in_review", "approved", "rejected", "suspended", "pending_payment", "draft"];
export const orgStatuses: OrgStatus[] = ["pending", "approved", "rejected", "suspended"];

/**
 * Exige administrador. Quem não é admin recebe 404 (a área não se anuncia).
 * A garantia real está no banco: as políticas *_admin e as funções admin_review_*.
 */
export async function requireAdmin(lang: string) {
  const s = await getSession();
  if (!s.supabase) return null;
  if (!s.user || !s.profile) redirect(`/${lang}/entrar`);
  if (s.profile.role !== "ADMIN") notFound();
  return { supabase: s.supabase, user: s.user, profile: s.profile };
}

const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

export async function adminCounts(supabase: ServerClient) {
  const [inReview, approved, orgsPending, orgsApproved] = await Promise.all([
    count(supabase.from("athletes").select("id", { count: "exact", head: true }).eq("status", "in_review")),
    count(supabase.from("athletes").select("id", { count: "exact", head: true }).eq("status", "approved")),
    count(supabase.from("organizations").select("id", { count: "exact", head: true }).eq("status", "pending")),
    count(supabase.from("organizations").select("id", { count: "exact", head: true }).eq("status", "approved")),
  ]);
  return { inReview, approved, orgsPending, orgsApproved };
}

export async function listAthletesByStatus(supabase: ServerClient, status: AthleteStatus) {
  const { data } = await supabase
    .from("athletes")
    .select("id, full_name, sport_name, birth_date, primary_position, country, state, city, status, submitted_at, updated_at, review_note")
    .eq("status", status)
    .order(status === "in_review" ? "submitted_at" : "updated_at", { ascending: status === "in_review" })
    .limit(200);
  return data ?? [];
}

/** Ficha completa para revisão + responsável principal (contato visível só ao admin). */
export async function getAthleteForReview(supabase: ServerClient, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: athlete } = await supabase.from("athletes").select("*").eq("id", id).maybeSingle();
  if (!athlete) notFound();
  const [media, clubs, achievements, guardian, history] = await Promise.all([
    supabase.from("athlete_media").select("*").eq("athlete_id", id).order("position").order("created_at"),
    supabase.from("athlete_clubs").select("*").eq("athlete_id", id).order("started_on", { ascending: false, nullsFirst: false }),
    supabase.from("athlete_achievements").select("*").eq("athlete_id", id).order("position"),
    supabase.from("athlete_guardians").select("relation, profiles(full_name, email, whatsapp, country)").eq("athlete_id", id).eq("is_primary", true).maybeSingle(),
    supabase.from("audit_log").select("action, created_at, meta").eq("entity_id", id).like("action", "athlete.review.%").order("created_at", { ascending: false }).limit(20),
  ]);
  const all = media.data ?? [];
  const bundle: AthleteBundle = {
    athlete,
    photos: all.filter((m) => m.kind === "photo").sort((a, b) => Number(b.is_primary) - Number(a.is_primary)),
    videos: all.filter((m) => m.kind === "youtube"),
    clubs: clubs.data ?? [],
    achievements: achievements.data ?? [],
  };
  const urls = await signedPhotoUrls(supabase, bundle.photos.map((p) => p.storage_path!).filter(Boolean));
  return { bundle, urls, guardian: guardian.data, history: history.data ?? [] };
}

export async function listOrganizationsByStatus(supabase: ServerClient, status: OrgStatus) {
  const { data } = await supabase
    .from("organizations")
    .select("id, name, kind, country, document, website, status, created_at, reviewed_at")
    .eq("status", status)
    .order("created_at", { ascending: status === "pending" })
    .limit(200);
  return data ?? [];
}
