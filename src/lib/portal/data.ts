import "server-only";
import { cache } from "react";
import { asUser } from "@/lib/db";
import { requireProAccount } from "@/lib/auth/session";
import { ATHLETE_AGE_MAX, ATHLETE_AGE_MIN, positions, feet, sexes, modalities, seekingKinds } from "@/domain/athlete";

/**
 * Leituras do portal dos profissionais. Tudo passa pelas funções pro_* do banco,
 * executadas COMO o próprio profissional (asUser): o banco decide o que ele pode ver
 * (organização aprovada, atleta aprovado e ativo, sem bloqueio) e devolve só campos
 * escolhidos — nunca contato da família, data de nascimento completa ou cidade.
 */

export type OrgKind = "club" | "manager" | "agent" | "scout" | "school" | "scouting_hub";
export const proKinds: OrgKind[] = ["club", "manager", "agent", "scout", "school", "scouting_hub"];

export type ProAccount = {
  role: string;
  approved: boolean;
  organization: { id: string; name: string; kind: string; country: string; state: string | null; status: "pending" | "approved" | "rejected" | "suspended"; review_note: string | null; is_owner: boolean } | null;
  limits: { views_per_day: number; interests_per_month: number; interest_expiry_days: number };
  usage: { views_today: number; interests_month: number };
};

export type AthleteCard = {
  id: string; display_name: string; age: number; birth_year: number; sex: string | null; modality: string | null;
  primary_position: string | null; secondary_positions: string[] | null; foot: string | null; height_cm: number | null;
  state: string | null; country: string; current_club: string | null; category: string | null; available: boolean | null;
  seeking: string[] | null; has_video: boolean; photo: string | null; focal_x: number | null; focal_y: number | null; zoom: number | null;
  is_favorite: boolean; approved_at: string | null;
};

export type AthleteProfile = {
  card: AthleteCard;
  bio: string | null; goals: string | null; experiences: string | null;
  weight_kg: number | null; measured_at: string | null;
  nationality: string | null; other_citizenships: string[] | null; valid_passport: boolean | null;
  federated: boolean | null; federation: string | null; current_club_since: string | null;
  travel: string | null; relocate_city: string | null; relocate_state: string | null; relocate_abroad: string | null;
  photos: { name: string; x: number; y: number; zoom: number; primary: boolean }[];
  videos: { youtube: string; title: string | null; description: string | null; type: string | null }[];
  clubs: { club: string; category: string | null; from: string | null; to: string | null }[];
  achievements: { title: string; competition: string | null; year: number | null }[];
  lists: string[];
  interest: { status: string; created_at: string } | null;
};

export type Filters = Partial<Record<
  "modality" | "age_min" | "age_max" | "sex" | "foot" | "country" | "state" | "height_min" | "seeking" | "available" | "relocate_abroad" | "with_video",
  string
>> & { positions?: string[] };

/** Conta do profissional + situação da organização (cacheada por requisição). */
export const proAccount = cache(async (userId: string) => {
  const [r] = await asUser<{ a: ProAccount }>(userId, (q) => q`select pro_account() as a`);
  return r.a;
});

/** Exige profissional logado. `null` = backend não configurado. */
export async function requirePro(lang: string) {
  const s = await requireProAccount(lang);
  if (!s) return null;
  return { ...s, pro: await proAccount(s.user.id) };
}

/** Para as páginas do portal: profissional de organização APROVADA, ou `null`. */
export async function requireApprovedPro(lang: string) {
  const s = await requirePro(lang);
  return s?.pro.approved ? s : null;
}

const int = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? String(n) : undefined;
};
const pick = <T extends string>(v: unknown, allowed: readonly T[]) => (allowed as readonly string[]).includes(String(v)) ? String(v) : undefined;

/** Filtros da URL (?posicao=ST&idade_min=13…) validados antes de irem ao banco. */
export function readFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]);
  const many = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[]) : sp[k] ? [sp[k] as string] : []);
  const f: Filters = {
    modality: pick(one("modalidade"), modalities),
    age_min: int(one("idade_min"), ATHLETE_AGE_MIN, ATHLETE_AGE_MAX),
    age_max: int(one("idade_max"), ATHLETE_AGE_MIN, ATHLETE_AGE_MAX),
    sex: pick(one("sexo"), sexes),
    foot: pick(one("pe"), feet),
    country: /^[A-Z]{2}$/.test(String(one("pais") ?? "")) ? String(one("pais")) : undefined,
    state: (() => { const s = String(one("estado") ?? "").trim(); return s.length >= 2 && s.length <= 60 ? s : undefined; })(),
    height_min: int(one("altura_min"), 80, 230),
    seeking: pick(one("busca"), seekingKinds),
    available: one("disponivel") === "1" ? "1" : undefined,
    relocate_abroad: one("exterior") === "1" ? "1" : undefined,
    with_video: one("video") === "1" ? "1" : undefined,
  };
  const pos = many("posicao").filter((p) => (positions as string[]).includes(p));
  if (pos.length) f.positions = pos;
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) as Filters;
}

export async function searchAthletes(userId: string, filters: Filters, page: number) {
  const rows = await asUser<AthleteCard & { total: string | number }>(userId, (q) =>
    q`select * from pro_search_athletes(${JSON.stringify(filters)}::jsonb, ${page})`);
  return { rows, total: Number(rows[0]?.total ?? 0), pageSize: 24 };
}

/** Ficha do atleta. `limit` = limite diário atingido; `null` = indisponível para este profissional. */
export async function athleteProfile(userId: string, athleteId: string): Promise<AthleteProfile | "limit" | null> {
  if (!/^[0-9a-f-]{36}$/i.test(athleteId)) return null;
  try {
    const [r] = await asUser<{ p: AthleteProfile }>(userId, (q) => q`select pro_athlete_profile(${athleteId}::uuid) as p`);
    return r?.p ?? null;
  } catch (e) {
    if (/daily limit/.test(String((e as Error).message))) return "limit";
    if (/not found/.test(String((e as Error).message))) return null;
    throw e;
  }
}

export async function savedAthletes(userId: string, listId?: string) {
  return asUser<AthleteCard>(userId, (q) => q`select * from pro_saved_athletes(${listId ?? null}::uuid)`);
}

export type ProList = { id: string; name: string; created_at: string; count: number; mine: boolean };
export async function myLists(userId: string) {
  return asUser<ProList>(userId, (q) => q`
    select l.id, l.name, l.created_at, (select count(*)::int from pro_list_items i where i.list_id = l.id) as count,
           l.created_by = public.vp_uid() as mine
      from pro_lists l where is_approved_pro() order by l.created_at desc`);
}

export type SentInterest = { id: string; athlete_id: string; athlete_name: string | null; status: string; message: string; created_at: string; resolved_at: string | null };
export async function myInterests(userId: string) {
  return asUser<SentInterest>(userId, (q) => q`select * from pro_my_interests()`);
}

// ---------------------------------------------------------------- área de trabalho (B1), relatório de IA (D1) e equipe (B2)
export const stages = ["watching", "evaluated", "interest", "talking", "archived"] as const;
export type Stage = (typeof stages)[number];

export type Workspace = {
  stage: Stage | null;
  notes: { id: string; body: string; tags: string[]; created_at: string; author: string; mine: boolean }[];
  evaluations: { id: string; created_at: string; author: string; mine: boolean; position_group: string; rubric_version: string; scores: Record<string, number>; observation: string | null; context: string | null; video_minute: number | null; youtube: string | null }[];
};
export async function workspace(userId: string, athleteId: string) {
  const [r] = await asUser<{ w: Workspace | null }>(userId, (q) => q`select pro_workspace(${athleteId}::uuid) as w`);
  return r?.w ?? null;
}
export async function athleteVideos(userId: string, athleteId: string) {
  return asUser<{ id: string; youtube: string; title: string | null; video_type: string | null }>(userId, (q) => q`select * from pro_athlete_videos(${athleteId}::uuid)`);
}
export type TimelineRow = { at: string; kind: string; detail: string | null; author: string | null };
export async function timeline(userId: string, athleteId: string) {
  const [r] = await asUser<{ j: TimelineRow[] }>(userId, (q) => q`select coalesce(jsonb_agg(to_jsonb(t)), '[]') as j from pro_athlete_timeline(${athleteId}::uuid) t`);
  return r?.j ?? [];
}
export type ProAiReport = {
  position: string; position_group: string; video_type: string; category: string | null; overall_score: number | null; coverage: number;
  confidence: string; summary: string; strengths: string[]; development: string[]; created_at: string; youtube: string | null;
  scores: { criterion: string; score: number; confidence: string; evidence: number }[];
};
export async function aiReport(userId: string, athleteId: string) {
  const [r] = await asUser<{ j: ProAiReport | null }>(userId, (q) => q`select pro_ai_report(${athleteId}::uuid) as j`);
  return r?.j ?? null;
}
export async function trackedAthletes(userId: string, stage?: Stage) {
  const [r] = await asUser<{ j: (AthleteCard & { stage: Stage; stage_updated_at: string })[] }>(userId, (q) =>
    q`select coalesce(jsonb_agg(to_jsonb(t)), '[]') as j from pro_tracked_athletes(${stage ?? null}) t`);
  return r?.j ?? [];
}
/** Ids de atletas com novidade desde a última visita da organização. */
export async function updatedIds(userId: string, ids: string[]) {
  if (!ids.length) return new Set<string>();
  const rows = await asUser<{ id: string }>(userId, (q) => q`select pro_updates(${ids}::uuid[]) as id`);
  return new Set(rows.map((r) => r.id));
}
export type TeamMember = { profile_id: string; full_name: string; email: string; is_owner: boolean; joined_at: string };
export async function team(userId: string) {
  const [members, invites] = await Promise.all([
    asUser<TeamMember>(userId, (q) => q`select profile_id, full_name, email, is_owner, joined_at::text from org_team()`),
    asUser<{ id: string; created_at: string; expires_at: string }>(userId, (q) =>
      q`select id, created_at::text, expires_at::text from organization_invites where used_at is null and revoked_at is null and expires_at > now() order by created_at desc`),
  ]);
  return { members, invites };
}
