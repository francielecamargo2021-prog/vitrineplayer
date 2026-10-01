import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient, type ServerClient } from "@/lib/supabase/server";
import { PHOTO_BUCKET, type AthleteBundle, type ActivityKind } from "@/domain/athlete";

/** Sessão atual (cacheada por requisição). `supabase === null` = backend não configurado. */
export const getSession = cache(async () => {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, user: null, profile: null } as const;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null } as const;
  const { data: profile } = await supabase.from("profiles").select("id, full_name, role").eq("id", user.id).single();
  return { supabase, user, profile } as const;
});

/** Exige responsável autenticado. Retorna `null` se o backend não estiver configurado. */
export async function requireGuardian(lang: string) {
  const s = await getSession();
  if (!s.supabase) return null;
  if (!s.user || !s.profile) redirect(`/${lang}/entrar`);
  if (s.profile.role !== "RESPONSIBLE") redirect(`/${lang}`);
  return { supabase: s.supabase, user: s.user, profile: s.profile };
}

/**
 * Atletas vinculados ao usuário. Filtra explicitamente pelo vínculo (além da RLS),
 * para que nem um admin veja atletas de terceiros dentro do painel da família.
 */
export async function listMyAthletes(supabase: ServerClient, uid: string) {
  const { data } = await supabase
    .from("athletes")
    .select("id, full_name, sport_name, birth_date, category, primary_position, current_club, status, visibility, athlete_guardians!inner(profile_id)")
    .eq("athlete_guardians.profile_id", uid)
    .order("created_at");
  return data ?? [];
}

export async function getAthleteBundle(supabase: ServerClient, uid: string, id: string): Promise<AthleteBundle> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: athlete } = await supabase
    .from("athletes")
    .select("*, athlete_guardians!inner(profile_id)")
    .eq("id", id)
    .eq("athlete_guardians.profile_id", uid)
    .maybeSingle();
  if (!athlete) notFound();
  const [media, clubs, achievements] = await Promise.all([
    supabase.from("athlete_media").select("*").eq("athlete_id", id).order("position").order("created_at"),
    supabase.from("athlete_clubs").select("*").eq("athlete_id", id).order("started_on", { ascending: false, nullsFirst: false }),
    supabase.from("athlete_achievements").select("*").eq("athlete_id", id).order("position").order("year", { ascending: false }),
  ]);
  const { athlete_guardians: _links, ...row } = athlete;
  void _links;
  const all = media.data ?? [];
  return {
    athlete: row,
    photos: all.filter((m) => m.kind === "photo").sort((a, b) => Number(b.is_primary) - Number(a.is_primary)),
    videos: all.filter((m) => m.kind === "youtube"),
    clubs: clubs.data ?? [],
    achievements: achievements.data ?? [],
  };
}

/** URLs temporárias (1 h) para fotos do bucket privado. */
export async function signedPhotoUrls(supabase: ServerClient, paths: string[]) {
  if (!paths.length) return {} as Record<string, string>;
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

/** Sinais de atividade (sem números, sem identidade). */
export async function activitySignals(supabase: ServerClient, id: string) {
  const { data } = await supabase.rpc("athlete_activity_signals", { p_athlete: id });
  return (data ?? []) as { kind: ActivityKind; last_at: string }[];
}
