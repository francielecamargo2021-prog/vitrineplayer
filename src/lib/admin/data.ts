import "server-only";
import { notFound } from "next/navigation";
import { asUser } from "@/lib/db";
import { requireAdminAccount } from "@/lib/auth/session";
import { photoUrl } from "@/lib/photos/server";
import type { AthleteBundle, AthleteRow, AthleteStatus, AchievementRow, ClubRow, MediaRow } from "@/domain/athlete";
import type { Database } from "@/lib/db/database.types";

/**
 * Leituras da área administrativa. Tudo roda COMO o admin (asUser) levando a prova do
 * segundo fator: o banco só reconhece o papel ADMIN com ela (is_admin() de 0010), então
 * uma senha vazada, sozinha, não lê nada daqui. As linhas voltam em JSON (datas como texto).
 */
export type OrgStatus = Database["public"]["Enums"]["review_status"];
export const athleteStatuses: AthleteStatus[] = ["in_review", "approved", "rejected", "suspended", "draft"];
export const orgStatuses: OrgStatus[] = ["pending", "approved", "rejected", "suspended"];
export const orgKinds = ["club", "manager", "agent", "scout", "school", "scouting_hub"] as const;
export const reportStatuses = ["open", "reviewing", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof reportStatuses)[number];

export type AdminSession = { user: { id: string; email: string }; profile: { full_name: string }; mfa: string };

/** Exige admin com segundo fator. `null` = backend não configurado. */
export async function requireAdmin(lang: string): Promise<AdminSession | null> {
  const s = await requireAdminAccount(lang);
  return s ? { user: s.user, profile: s.profile, mfa: s.mfa } : null;
}

type Sql = Parameters<Parameters<typeof asUser>[1]>[0];
type Query = ReturnType<Parameters<typeof asUser>[1]>;
/** Uma consulta que devolve UM documento JSON na coluna `j`. */
async function json<T>(s: AdminSession, fn: (q: Sql) => Query): Promise<T> {
  const [r] = await asUser<{ j: T }>(s.user.id, fn, { mfa: s.mfa });
  return r?.j as T;
}
const like = (q?: string) => (q && q.trim().length >= 2 ? `%${q.trim().replace(/[%_\\]/g, "")}%` : null);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// ---------------------------------------------------------------- visão geral e busca
export type Counts = Record<"inReview" | "approved" | "orgsPending" | "orgsApproved" | "reportsOpen" | "interestsOpen" | "aiQueued" | "correctionsOpen" | "suspendedAccounts" | "outbox", number>;
export async function adminCounts(s: AdminSession) {
  return json<Counts>(s, (q) => q`select jsonb_build_object(
    'inReview', (select count(*) from athletes where status = 'in_review'),
    'approved', (select count(*) from athletes where status = 'approved'),
    'orgsPending', (select count(*) from organizations where status = 'pending'),
    'orgsApproved', (select count(*) from organizations where status = 'approved'),
    'reportsOpen', (select count(*) from contact_requests where report_status in ('open', 'reviewing')),
    'interestsOpen', (select count(*) from contact_requests where interest_status(status, created_at) = 'requested'),
    'aiQueued', (select count(*) from ai_analysis_requests where status in ('queued', 'processing')),
    'correctionsOpen', (select count(*) from athlete_correction_requests where resolved_at is null),
    'suspendedAccounts', (select count(*) from profiles where suspended_at is not null),
    'outbox', (select count(*) from notification_outbox where status = 'queued')) as j`);
}

export type SearchHit = { kind: "athlete" | "account" | "organization"; id: string; title: string; detail: string };
export async function searchAll(s: AdminSession, term: string) {
  const t = like(term);
  if (!t) return [];
  return json<SearchHit[]>(s, (q) => q`select coalesce(jsonb_agg(x), '[]') as j from (
    (select 'athlete' as kind, a.id, coalesce(nullif(a.sport_name, ''), a.full_name) as title, a.full_name || ' · ' || a.status as detail
       from athletes a where a.full_name ilike ${t} or a.sport_name ilike ${t} order by a.full_name limit 20)
    union all
    (select 'account', p.id, p.full_name, p.email || ' · ' || p.role
       from profiles p where p.full_name ilike ${t} or p.email ilike ${t} order by p.full_name limit 20)
    union all
    (select 'organization', o.id, o.name, o.kind || ' · ' || o.status
       from organizations o where o.name ilike ${t} or o.document ilike ${t} order by o.name limit 20)
  ) x`);
}

// ---------------------------------------------------------------- atletas
export type AthleteFilters = { status: AthleteStatus; country?: string; position?: string; visibility?: string; q?: string };
export type AthleteListRow = Pick<AthleteRow, "id" | "full_name" | "sport_name" | "birth_date" | "primary_position" | "country" | "state" | "city" | "status" | "submitted_at" | "updated_at" | "visibility" | "category">;
export async function listAthletes(s: AdminSession, f: AthleteFilters) {
  const t = like(f.q);
  const rows = await json<(AthleteListRow & { sort_at: string })[]>(s, (q) => q`select coalesce(jsonb_agg(x order by x.sort_at), '[]') as j from (
    select a.id, a.full_name, a.sport_name, a.birth_date, a.primary_position, a.country, a.state, a.city, a.status, a.submitted_at,
           a.updated_at, a.visibility, a.category, coalesce(case when a.status = 'in_review' then a.submitted_at end, a.updated_at) as sort_at
      from athletes a
     where a.status = ${f.status}
       and (${f.country ?? null}::text is null or a.country = ${f.country ?? null})
       and (${f.position ?? null}::text is null or a.primary_position::text = ${f.position ?? null})
       and (${f.visibility ?? null}::text is null or a.visibility::text = ${f.visibility ?? null})
       and (${t}::text is null or a.full_name ilike ${t} or a.sport_name ilike ${t})
     limit 300) x`);
  return f.status === "in_review" ? rows : rows.reverse();
}

export type Guardian = { profile_id: string; full_name: string; email: string; whatsapp: string | null; relation: string; is_primary: boolean; suspended_at: string | null };
export type AuditRow = { action: string; created_at: string; meta: Record<string, unknown> | null; actor: string | null };
export type Correction = { id: string; note: string; created_at: string; resolved_at: string | null };
export type AiRequestRow = {
  id: string; status: string; video_type: string; created_at: string; cost_usd: number; error: string | null; athlete_id?: string; athlete?: string;
  /** só no console da IA: decide se "Processar agora" aparece */
  video_seconds?: number; model?: string; athlete_status?: string;
};

/** Ficha completa para revisão, com responsáveis (contato só para o admin), histórico, correções e IA. */
export async function getAthleteForReview(s: AdminSession, id: string) {
  if (!isUuid(id)) notFound();
  const d = await json<{
    athlete: AthleteRow | null; media: MediaRow[]; clubs: ClubRow[]; achievements: AchievementRow[]; guardians: Guardian[];
    history: AuditRow[]; corrections: Correction[]; ai: { allowance: number; requests: AiRequestRow[]; grants: { quantity: number; reason: string; created_at: string }[] };
  }>(s, (q) => q`select jsonb_build_object(
    'athlete', (select to_jsonb(a) from athletes a where a.id = ${id}),
    'media', (select coalesce(jsonb_agg(to_jsonb(m) order by m.position, m.created_at), '[]') from athlete_media m where m.athlete_id = ${id}),
    'clubs', (select coalesce(jsonb_agg(to_jsonb(c) order by c.started_on desc nulls last), '[]') from athlete_clubs c where c.athlete_id = ${id}),
    'achievements', (select coalesce(jsonb_agg(to_jsonb(x) order by x.position), '[]') from athlete_achievements x where x.athlete_id = ${id}),
    'guardians', (select coalesce(jsonb_agg(jsonb_build_object('profile_id', p.id, 'full_name', p.full_name, 'email', p.email, 'whatsapp', p.whatsapp,
                    'relation', g.relation, 'is_primary', g.is_primary, 'suspended_at', p.suspended_at) order by g.is_primary desc), '[]')
                  from athlete_guardians g join profiles p on p.id = g.profile_id where g.athlete_id = ${id}),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('action', l.action, 'created_at', l.created_at, 'meta', l.meta, 'actor', p.full_name)
                    order by l.created_at desc), '[]')
                  from (select * from audit_log where entity_id = ${id} order by created_at desc limit 40) l left join profiles p on p.id = l.actor_id),
    'corrections', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'note', c.note, 'created_at', c.created_at, 'resolved_at', c.resolved_at)
                    order by c.created_at desc), '[]') from athlete_correction_requests c where c.athlete_id = ${id}),
    'ai', jsonb_build_object(
      'allowance', ai_analysis_allowance(${id}::uuid),
      'requests', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status, 'video_type', r.video_type, 'created_at', r.created_at,
                     'cost_usd', r.cost_usd, 'error', r.error) order by r.created_at desc), '[]') from ai_analysis_requests r where r.athlete_id = ${id}),
      'grants', (select coalesce(jsonb_agg(jsonb_build_object('quantity', g.quantity, 'reason', g.reason, 'created_at', g.created_at) order by g.created_at desc), '[]')
                   from ai_analysis_grants g where g.athlete_id = ${id}))) as j`);
  if (!d?.athlete) notFound();
  const bundle: AthleteBundle = {
    athlete: d.athlete,
    photos: d.media.filter((m) => m.kind === "photo").sort((a, b) => Number(b.is_primary) - Number(a.is_primary)),
    videos: d.media.filter((m) => m.kind === "youtube"),
    clubs: d.clubs,
    achievements: d.achievements,
  };
  const urls = Object.fromEntries(bundle.photos.map((p) => [p.storage_path!, photoUrl(p.storage_path!)]));
  return { bundle, urls, guardians: d.guardians, history: d.history, corrections: d.corrections, ai: d.ai };
}

// ---------------------------------------------------------------- contas (responsáveis e profissionais)
export type AccountRow = { id: string; full_name: string; email: string; role: string; country: string | null; created_at: string; suspended_at: string | null; athletes: number; org: string | null };
export async function listAccounts(s: AdminSession, f: { role: "RESPONSIBLE" | "PROFESSIONAL" | "ADMIN"; suspended?: boolean; q?: string }) {
  const t = like(f.q);
  return json<AccountRow[]>(s, (q) => q`select coalesce(jsonb_agg(x order by x.created_at desc), '[]') as j from (
    select p.id, p.full_name, p.email, p.role, p.country, p.created_at, p.suspended_at,
           (select count(*) from athlete_guardians g where g.profile_id = p.id) as athletes,
           (select o.name from organization_members m join organizations o on o.id = m.organization_id where m.profile_id = p.id limit 1) as org
      from profiles p
     where (p.role::text = ${f.role} or (${f.role} = 'PROFESSIONAL' and p.role = 'SCOUT'))
       and (${f.suspended ?? false} = false or p.suspended_at is not null)
       and (${t}::text is null or p.full_name ilike ${t} or p.email ilike ${t})
     order by p.created_at desc limit 300) x`);
}

export type AccountDetail = {
  profile: { id: string; full_name: string; email: string; whatsapp: string | null; country: string | null; locale: string; role: string; created_at: string; suspended_at: string | null; suspension_note: string | null };
  consents: { kind: string; version: string; athlete_id: string | null; granted_at: string; revoked_at: string | null }[];
  athletes: { id: string; name: string; status: string; relation: string; other_guardians: number }[];
  organizations: { id: string; name: string; kind: string; status: string; is_owner: boolean }[];
  activity: AuditRow[];
};
export async function getAccountDetail(s: AdminSession, id: string) {
  if (!isUuid(id)) notFound();
  const d = await json<AccountDetail | null>(s, (q) => q`select case when p.id is null then null else jsonb_build_object(
    'profile', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'whatsapp', p.whatsapp, 'country', p.country,
                 'locale', p.locale, 'role', p.role, 'created_at', p.created_at, 'suspended_at', p.suspended_at, 'suspension_note', p.suspension_note),
    'consents', (select coalesce(jsonb_agg(jsonb_build_object('kind', c.kind, 'version', c.version, 'athlete_id', c.athlete_id,
                   'granted_at', c.granted_at, 'revoked_at', c.revoked_at) order by c.granted_at), '[]') from consents c where c.profile_id = p.id),
    'athletes', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', coalesce(nullif(a.sport_name, ''), a.full_name), 'status', a.status,
                   'relation', g.relation, 'other_guardians', (select count(*) from athlete_guardians o where o.athlete_id = a.id and o.profile_id <> p.id))), '[]')
                  from athlete_guardians g join athletes a on a.id = g.athlete_id where g.profile_id = p.id),
    'organizations', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'kind', o.kind, 'status', o.status, 'is_owner', m.is_owner)), '[]')
                  from organization_members m join organizations o on o.id = m.organization_id where m.profile_id = p.id),
    'activity', (select coalesce(jsonb_agg(jsonb_build_object('action', l.action, 'created_at', l.created_at, 'meta', l.meta, 'actor', null) order by l.created_at desc), '[]')
                  from (select * from audit_log where actor_id = p.id or entity_id = p.id order by created_at desc limit 40) l)
  ) end as j from (select ${id}::uuid as id) k left join profiles p on p.id = k.id`);
  if (!d) notFound();
  return d;
}

// ---------------------------------------------------------------- organizações
export type OrgRow = {
  id: string; name: string; kind: string; country: string; state: string | null; city: string | null; document: string | null; license: string | null;
  website: string | null; about: string | null; contact_name: string | null; contact_role: string | null; contact_email: string | null; contact_phone: string | null;
  review_note: string | null; status: OrgStatus; created_at: string; reviewed_at: string | null; members: number; reports: number;
  /** faixa autorizada pelo admin (0015); nulos = padrão do tipo */
  athlete_age_min: number | null; athlete_age_max: number | null; age_band_at?: string | null;
};
export async function listOrganizations(s: AdminSession, f: { status: OrgStatus; kind?: string; q?: string }) {
  const t = like(f.q);
  const rows = await json<OrgRow[]>(s, (q) => q`select coalesce(jsonb_agg(x order by x.created_at), '[]') as j from (
    select o.id, o.name, o.kind, o.country, o.state, o.city, o.document, o.license, o.website, o.about, o.contact_name, o.contact_role,
           o.contact_email, o.contact_phone, o.review_note, o.status, o.created_at, o.reviewed_at, o.athlete_age_min, o.athlete_age_max,
           (select count(*) from organization_members m where m.organization_id = o.id) as members,
           (select count(*) from contact_requests r where r.organization_id = o.id and r.reported_at is not null) as reports
      from organizations o
     where o.status = ${f.status}
       and (${f.kind ?? null}::text is null or o.kind::text = ${f.kind ?? null})
       and (${t}::text is null or o.name ilike ${t} or o.document ilike ${t})
     limit 300) x`);
  return f.status === "pending" ? rows : rows.reverse();
}

export type OrgDetail = {
  org: OrgRow;
  members: { profile_id: string; full_name: string; email: string; is_owner: boolean; suspended_at: string | null }[];
  invites: { id: string; created_at: string; expires_at: string; used_at: string | null; revoked_at: string | null }[];
  usage: { lists: number; notes: number; evaluations: number; tracking: number; views_30d: number; interests: Record<string, number> };
  reports: ReportRow[];
  history: AuditRow[];
};
export async function getOrganizationDetail(s: AdminSession, id: string) {
  if (!isUuid(id)) notFound();
  const d = await json<OrgDetail | null>(s, (q) => q`select case when o.id is null then null else jsonb_build_object(
    'org', to_jsonb(o) || jsonb_build_object('members', (select count(*) from organization_members m where m.organization_id = o.id),
                                             'reports', (select count(*) from contact_requests r where r.organization_id = o.id and r.reported_at is not null)),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('profile_id', p.id, 'full_name', p.full_name, 'email', p.email, 'is_owner', m.is_owner,
                  'suspended_at', p.suspended_at) order by m.is_owner desc), '[]')
                 from organization_members m join profiles p on p.id = m.profile_id where m.organization_id = o.id),
    'invites', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'created_at', i.created_at, 'expires_at', i.expires_at, 'used_at', i.used_at,
                  'revoked_at', i.revoked_at) order by i.created_at desc), '[]') from organization_invites i where i.organization_id = o.id),
    'usage', jsonb_build_object(
      'lists', (select count(*) from pro_lists l where l.organization_id = o.id),
      'notes', (select count(*) from pro_notes n where n.organization_id = o.id),
      'evaluations', (select count(*) from scout_evaluations e where e.organization_id = o.id),
      'tracking', (select count(*) from pro_tracking t where t.organization_id = o.id),
      'views_30d', (select count(*) from athlete_views v where v.organization_id = o.id and v.kind = 'view' and v.viewed_at > now() - interval '30 days'),
      'interests', (select coalesce(jsonb_object_agg(st, n), '{}') from (select interest_status(r.status, r.created_at) st, count(*) n
                      from contact_requests r where r.organization_id = o.id group by 1) z)),
    'reports', '[]'::jsonb,
    'history', (select coalesce(jsonb_agg(jsonb_build_object('action', l.action, 'created_at', l.created_at, 'meta', l.meta, 'actor', p.full_name)
                  order by l.created_at desc), '[]')
                 from (select * from audit_log where entity_id = o.id order by created_at desc limit 40) l left join profiles p on p.id = l.actor_id)
  ) end as j from (select ${id}::uuid as id) k left join organizations o on o.id = k.id`);
  if (!d) notFound();
  d.reports = await listReports(s, { organization: id });
  return d;
}

// ---------------------------------------------------------------- denúncias e interesses
export type ReportRow = {
  id: string; organization_id: string; org_name: string; org_status: string; athlete_id: string; athlete: string; message: string;
  reason: string | null; reported_at: string; report_status: ReportStatus; resolution: string | null; resolved_at: string | null; resolved_by: string | null;
};
export async function listReports(s: AdminSession, f: { status?: ReportStatus; organization?: string }) {
  return json<ReportRow[]>(s, (q) => q`select coalesce(jsonb_agg(x order by x.reported_at desc), '[]') as j from (
    select r.id, r.organization_id, o.name as org_name, o.status as org_status, r.athlete_id,
           coalesce(nullif(a.sport_name, ''), a.full_name) as athlete, r.message, r.report_reason as reason, r.reported_at,
           r.report_status, r.report_resolution as resolution, r.report_resolved_at as resolved_at, p.full_name as resolved_by
      from contact_requests r join organizations o on o.id = r.organization_id join athletes a on a.id = r.athlete_id
      left join profiles p on p.id = r.report_resolved_by
     where r.reported_at is not null
       and (${f.status ?? null}::text is null or r.report_status = ${f.status ?? null})
       and (${f.organization ?? null}::uuid is null or r.organization_id = ${f.organization ?? null}::uuid)
     limit 300) x`);
}

export type InterestRow = { id: string; created_at: string; status: string; message: string; org_name: string; organization_id: string; athlete: string; athlete_id: string; reported: boolean };
export async function interestsOverview(s: AdminSession, status?: string) {
  return json<{ totals: Record<string, number>; month: number; rows: InterestRow[] }>(s, (q) => q`select jsonb_build_object(
    'totals', (select coalesce(jsonb_object_agg(st, n), '{}') from (select interest_status(status, created_at) st, count(*) n from contact_requests group by 1) z),
    'month', (select count(*) from contact_requests where created_at >= date_trunc('month', now())),
    'rows', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
       select r.id, r.created_at, interest_status(r.status, r.created_at) as status, r.message, o.name as org_name, r.organization_id,
              coalesce(nullif(a.sport_name, ''), a.full_name) as athlete, r.athlete_id, r.reported_at is not null as reported
         from contact_requests r join organizations o on o.id = r.organization_id join athletes a on a.id = r.athlete_id
        where ${status ?? null}::text is null or interest_status(r.status, r.created_at) = ${status ?? null}
        order by r.created_at desc limit 200) x)) as j`);
}

// ---------------------------------------------------------------- IA, avisos, auditoria e configurações
export type AiConsole = {
  settings: { enabled: boolean; model: string; daily_budget_usd: number; monthly_budget_usd: number; max_requests_per_30d: number; segment_minutes: number; included_per_athlete: number; updated_at: string };
  byStatus: Record<string, number>; costMonth: number; costTotal: number;
  requests: AiRequestRow[]; grants: { athlete: string; athlete_id: string; quantity: number; reason: string; created_at: string; by: string | null }[];
  batches: { id: string; status: string; item_count: number; estimated_cost_usd: number; cost_usd: number; created_at: string }[];
};
export async function aiConsole(s: AdminSession) {
  return json<AiConsole>(s, (q) => q`select jsonb_build_object(
    'settings', (select to_jsonb(x) from ai_settings x),
    'byStatus', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from ai_analysis_requests group by 1) z),
    'costMonth', (select coalesce(sum(cost_usd), 0) from ai_analysis_requests where created_at >= date_trunc('month', now())),
    'costTotal', (select coalesce(sum(cost_usd), 0) from ai_analysis_requests),
    'requests', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
       select r.id, r.status, r.video_type, r.created_at, r.cost_usd, r.error, r.athlete_id, coalesce(nullif(a.sport_name, ''), a.full_name) as athlete,
              greatest(1, coalesce(r.range_end_s, r.video_minutes * 60) - coalesce(r.range_start_s, 0)) as video_seconds, r.model, a.status::text as athlete_status
         from ai_analysis_requests r join athletes a on a.id = r.athlete_id order by r.created_at desc limit 100) x),
    'grants', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
       select coalesce(nullif(a.sport_name, ''), a.full_name) as athlete, g.athlete_id, g.quantity, g.reason, g.created_at, p.full_name as by
         from ai_analysis_grants g join athletes a on a.id = g.athlete_id left join profiles p on p.id = g.granted_by order by g.created_at desc limit 50) x),
    'batches', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
       select b.id, b.status, b.item_count, b.estimated_cost_usd, b.cost_usd, b.created_at from ai_batches b order by b.created_at desc limit 20) x)
  ) as j`);
}

export type OutboxRow = { id: string; template: string; channel: string; status: string; scheduled_at: string; recipient: string; attempts: number };
export async function outbox(s: AdminSession) {
  return json<OutboxRow[]>(s, (q) => q`select coalesce(jsonb_agg(x order by x.scheduled_at desc), '[]') as j from (
    select n.id, n.template, n.channel, n.status, n.scheduled_at, n.attempts, p.full_name || ' <' || p.email || '>' as recipient
      from notification_outbox n join profiles p on p.id = n.profile_id order by n.scheduled_at desc limit 200) x`);
}

export async function auditLog(s: AdminSession, f: { action?: string; entity?: string; q?: string }) {
  const t = like(f.q);
  return json<(AuditRow & { entity: string | null; entity_id: string | null })[]>(s, (q) => q`select coalesce(jsonb_agg(x order by x.created_at desc), '[]') as j from (
    select l.action, l.created_at, l.meta, l.entity, l.entity_id, p.full_name as actor
      from audit_log l left join profiles p on p.id = l.actor_id
     where (${f.action ?? null}::text is null or l.action like ${f.action ?? ""} || '%')
       and (${f.entity && isUuid(f.entity) ? f.entity : null}::uuid is null or l.entity_id = ${f.entity && isUuid(f.entity) ? f.entity : null}::uuid)
       and (${t}::text is null or p.full_name ilike ${t} or l.meta::text ilike ${t})
     order by l.created_at desc limit 300) x`);
}

export type PortalSettings = { profile_views_per_day: number; interests_per_month: number; interest_expiry_days: number; updated_at: string };
export async function portalSettings(s: AdminSession) {
  return json<PortalSettings>(s, (q) => q`select to_jsonb(x) as j from portal_settings x`);
}
