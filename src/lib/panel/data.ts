import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getAccount, requireGuardianAccount } from "@/lib/auth/session";
import { userDataClient, type DataClient } from "@/lib/db/data-api";
import type { AthleteBundle, ActivityKind } from "@/domain/athlete";

/**
 * Sessão atual (cacheada por requisição). O login vem do Neon Auth (src/lib/auth);
 * `db` é o acesso aos DADOS, que ainda usa o cliente antigo até a Etapa 3 da
 * migração. Sem ele, as páginas mostram o aviso de migração em vez de dados.
 */
export const getSession = cache(async () => {
  const account = await getAccount();
  const db = account.user ? await userDataClient() : null;
  return { ...account, db } as const;
});

/** Exige responsável autenticado, com e-mail confirmado e cadastro completo. `null` = sem dados disponíveis. */
export async function requireGuardian(lang: string) {
  const s = await requireGuardianAccount(lang);
  if (!s) return null;
  const { db } = await getSession();
  if (!db) return null;
  return { db, user: s.user, profile: s.profile };
}

/**
 * Atletas vinculados ao usuário. Filtra explicitamente pelo vínculo (além da RLS),
 * para que nem um admin veja atletas de terceiros dentro do painel da família.
 */
export async function listMyAthletes(db: DataClient, uid: string) {
  const { data } = await db
    .from("athletes")
    .select("id, full_name, sport_name, birth_date, category, primary_position, current_club, status, visibility, athlete_guardians!inner(profile_id)")
    .eq("athlete_guardians.profile_id", uid)
    .order("created_at");
  return data ?? [];
}

export async function getAthleteBundle(db: DataClient, uid: string, id: string): Promise<AthleteBundle> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: athlete } = await db
    .from("athletes")
    .select("*, athlete_guardians!inner(profile_id)")
    .eq("id", id)
    .eq("athlete_guardians.profile_id", uid)
    .maybeSingle();
  if (!athlete) notFound();
  const [media, clubs, achievements] = await Promise.all([
    db.from("athlete_media").select("*").eq("athlete_id", id).order("position").order("created_at"),
    db.from("athlete_clubs").select("*").eq("athlete_id", id).order("started_on", { ascending: false, nullsFirst: false }),
    db.from("athlete_achievements").select("*").eq("athlete_id", id).order("position").order("year", { ascending: false }),
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

/**
 * Endereços das fotos. Os arquivos migram para o Vercel Blob privado na Etapa 4
 * (rota /api/fotos que confere a RLS antes de ler o arquivo). Até lá, nenhuma foto é servida.
 */
export async function signedPhotoUrls(_db: DataClient, _paths: string[]) {
  void _db; void _paths;
  return {} as Record<string, string>;
}

/** Sinais de atividade (sem números, sem identidade). */
export async function activitySignals(db: DataClient, id: string) {
  const { data } = await db.rpc("athlete_activity_signals", { p_athlete: id });
  return (data ?? []) as { kind: ActivityKind; last_at: string }[];
}

/** Pedido de avaliação por IA mais recente do atleta + relatório (se houver). Leitura do responsável (RLS). */
export async function getAiState(db: DataClient, athleteId: string) {
  const { data: request } = await db
    .from("ai_analysis_requests")
    .select("id, status, media_id, video_type, shirt_number, shirt_color, position, created_at, completed_at")
    .eq("athlete_id", athleteId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: report } = await db
    .from("ai_video_reports")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { request, report };
}
