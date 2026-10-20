import "server-only";
import { asService, dbReady } from "@/lib/db";
import type { AiRepo, JobWithRequest, NotificationTemplate } from "./pipeline.ts";
import type { Batch, FinalReport, Job, RequestContext, RequestStatus, Settings } from "./types.ts";

/**
 * Repositório do pipeline da IA no Postgres (Neon), pela conexão de SERVIÇO do
 * servidor (asService). Usado SOMENTE pelo processador (/api/ai/ciclo); nada disto
 * chega ao navegador. As funções ai_* do banco conferem o papel de serviço.
 */
export function aiRepo(): AiRepo | null {
  return dbReady() ? new DbAiRepo() : null;
}

const num = (v: unknown) => Number(v ?? 0);
const toJob = (j: Record<string, unknown>): Job => ({ ...(j as unknown as Job), estimated_cost_usd: num(j.estimated_cost_usd) });
const json = (v: unknown) => JSON.stringify(v ?? null);

/** Colunas do pedido devolvidas ao pipeline (mesmo formato de antes). */
const requestJson = (alias: string) => `jsonb_build_object(
  'id', ${alias}.id, 'athlete_id', ${alias}.athlete_id, 'media_id', ${alias}.media_id, 'status', ${alias}.status,
  'video_type', ${alias}.video_type, 'youtube_id', ${alias}.youtube_id, 'video_minutes', ${alias}.video_minutes,
  'range_start_s', ${alias}.range_start_s, 'range_end_s', ${alias}.range_end_s, 'shirt_number', ${alias}.shirt_number,
  'shirt_color', ${alias}.shirt_color, 'position', ${alias}.position, 'category', ${alias}.category,
  'birth_year', ${alias}.birth_year, 'report_locale', ${alias}.report_locale, 'rubric_version', ${alias}.rubric_version,
  'prompt_version', ${alias}.prompt_version, 'model', ${alias}.model)`;
const JOB_COLS = "j.id, j.request_id, j.kind, j.seq, j.start_s, j.end_s, j.status, j.batch_id, j.attempts, j.estimated_cost_usd, j.result, j.created_at::text as created_at";

class DbAiRepo implements AiRepo {
  async getSettings(): Promise<Settings> {
    const [s] = await asService<Record<string, unknown>>((q) => q`select * from ai_settings limit 1`);
    if (!s) throw new Error("ai_settings ausente");
    return {
      enabled: Boolean(s.enabled), model: String(s.model),
      daily_budget_usd: num(s.daily_budget_usd), monthly_budget_usd: num(s.monthly_budget_usd),
      max_items_per_batch: num(s.max_items_per_batch), max_wait_hours: num(s.max_wait_hours),
      max_attempts: num(s.max_attempts), segment_minutes: num(s.segment_minutes),
    };
  }

  async requestsToPlan(limit: number) {
    const rows = await asService<{ r: RequestContext }>((q) => q.query(`
      select ${requestJson("r")} as r from ai_analysis_requests r
       where r.status = 'queued' and not exists (select 1 from ai_analysis_jobs j where j.request_id = r.id)
       order by r.queued_at limit $1`, [limit]));
    return rows.map((x) => x.r);
  }

  async insertJobs(requestId: string, jobs: { kind: Job["kind"]; seq: number; start_s: number; end_s: number; estimated_cost_usd: number }[]) {
    if (!jobs.length) return;
    await asService((q) => q`
      insert into ai_analysis_jobs (request_id, kind, seq, start_s, end_s, estimated_cost_usd)
      select ${requestId}::uuid, j.kind::ai_job_kind, j.seq, j.start_s, j.end_s, j.estimated_cost_usd
        from jsonb_to_recordset(${json(jobs)}::jsonb) as j(kind text, seq smallint, start_s int, end_s int, estimated_cost_usd numeric)
      on conflict (request_id, kind, seq) do nothing`);
  }

  async setRequestEstimate(requestId: string, usd: number) {
    await asService((q) => q`update ai_analysis_requests set estimated_cost_usd = ${usd} where id = ${requestId}`);
  }

  async pendingJobs(limit: number, maxAttempts: number): Promise<JobWithRequest[]> {
    const rows = await asService<Record<string, unknown>>((q) => q.query(`
      select ${JOB_COLS}, ${requestJson("r")} as request from ai_analysis_jobs j
        join ai_analysis_requests r on r.id = j.request_id
       where j.status = 'pending' and j.attempts < $1 and r.status in ('queued', 'processing')
       order by j.created_at limit $2`, [maxAttempts, limit]));
    return rows.map((r) => ({ ...toJob(r), request: r.request as RequestContext }));
  }

  async spentSince(since: Date) {
    const [r] = await asService<{ v: unknown }>((q) => q`select ai_spent_since(${since.toISOString()}::timestamptz) as v`);
    return num(r?.v);
  }

  async createBatch(row: { id: string; model: string; item_count: number; estimated_cost_usd: number }) {
    await asService((q) => q`insert into ai_batches (id, model, item_count, estimated_cost_usd, status)
      values (${row.id}, ${row.model}, ${row.item_count}, ${row.estimated_cost_usd}, 'creating')`);
  }

  async updateBatch(id: string, patch: Record<string, unknown>) {
    const allowed = ["status", "provider_name", "error", "submitted_at", "completed_at"];
    const p = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
    if (!Object.keys(p).length) return;
    await asService((q) => q`
      update ai_batches b set
        status        = case when x.p ? 'status'        then (x.p->>'status')::ai_batch_status   else b.status end,
        provider_name = case when x.p ? 'provider_name' then x.p->>'provider_name'               else b.provider_name end,
        error         = case when x.p ? 'error'         then x.p->>'error'                       else b.error end,
        submitted_at  = case when x.p ? 'submitted_at'  then (x.p->>'submitted_at')::timestamptz else b.submitted_at end,
        completed_at  = case when x.p ? 'completed_at'  then (x.p->>'completed_at')::timestamptz else b.completed_at end
      from (select ${json(p)}::jsonb as p) x where b.id = ${id}`);
  }

  async openBatches(): Promise<Batch[]> {
    const rows = await asService<Record<string, unknown>>((q) => q`
      select id, provider, provider_name, model, status, item_count, estimated_cost_usd, cost_usd, error,
             created_at::text as created_at, submitted_at::text as submitted_at, completed_at::text as completed_at
        from ai_batches where status in ('creating', 'submitted') order by created_at`);
    return rows.map((b) => ({ ...(b as unknown as Batch), estimated_cost_usd: num(b.estimated_cost_usd), cost_usd: num(b.cost_usd) }));
  }

  async claimJobs(ids: string[], batchId: string) {
    const rows = await asService<{ id: string }>((q) => q`select ai_claim_jobs(${ids}::uuid[], ${batchId}::uuid) as id`);
    return rows.map((r) => r.id);
  }

  async releaseJobs(ids: string[], error: string, maxAttempts: number) {
    return asService<{ job_id: string; request_id: string; failed: boolean }>((q) =>
      q`select * from ai_release_jobs(${ids}::uuid[], ${error}, ${maxAttempts})`);
  }

  async batchJobs(batchId: string): Promise<JobWithRequest[]> {
    const rows = await asService<Record<string, unknown>>((q) => q.query(`
      select ${JOB_COLS}, ${requestJson("r")} as request from ai_analysis_jobs j
        join ai_analysis_requests r on r.id = j.request_id
       where j.batch_id = $1 and j.status = 'submitted'`, [batchId]));
    return rows.map((r) => ({ ...toJob(r), request: r.request as RequestContext }));
  }

  async requestJobs(requestId: string) {
    const rows = await asService<Record<string, unknown>>((q) => q.query(
      `select ${JOB_COLS} from ai_analysis_jobs j where j.request_id = $1 order by j.kind, j.seq`, [requestId]));
    return rows.map(toJob);
  }

  async completeJob(id: string, batchId: string, d: { result: unknown; input_tokens: number; output_tokens: number; cost_usd: number }) {
    const [r] = await asService<{ ok: boolean }>((q) => q`select ai_complete_job(${id}::uuid, ${batchId}::uuid, ${json(d.result)}::jsonb,
      ${d.input_tokens}, ${d.output_tokens}, ${d.cost_usd}) as ok`);
    return Boolean(r?.ok);
  }

  async addJobCost(id: string, batchId: string, u: { input_tokens: number; output_tokens: number; cost_usd: number }) {
    await asService((q) => q`select ai_add_job_cost(${id}::uuid, ${batchId}::uuid, ${u.input_tokens}, ${u.output_tokens}, ${u.cost_usd})`);
  }

  async cancelJobs(requestId: string) {
    await asService((q) => q`update ai_analysis_jobs set status = 'cancelled' where request_id = ${requestId} and status = 'pending'`);
  }

  async getRequestStatus(requestId: string) {
    const [r] = await asService<{ status: RequestStatus }>((q) => q`select status from ai_analysis_requests where id = ${requestId}`);
    return r?.status ?? null;
  }

  async setRequestStatus(requestId: string, status: RequestStatus, error?: string) {
    await asService((q) => q`select ai_set_request_status(${requestId}::uuid, ${status}::ai_analysis_status, ${error ?? null})`);
  }

  async saveReport(r: FinalReport) {
    const { scores, ...rep } = r;
    await asService((q) => q`
      with ins as (
        insert into ai_video_reports (request_id, athlete_id, media_id, video_type, position, position_group, category,
          rubric_version, model, overall_score, coverage, confidence, summary, strengths, development,
          decision_notes, positioning_notes, report)
        values (${rep.request_id}, ${rep.athlete_id}, ${rep.media_id}, ${rep.video_type}::video_type, ${rep.position}::football_position,
          ${rep.position_group}, ${rep.category}, ${rep.rubric_version}, ${rep.model}, ${rep.overall_score}, ${rep.coverage},
          ${rep.confidence}::ai_confidence, ${rep.summary}, ${rep.strengths}::text[], ${rep.development}::text[],
          ${rep.decision_notes}, ${rep.positioning_notes}, ${json(rep.report)}::jsonb)
        on conflict (request_id) do nothing returning id),
      rid as (select id from ins union all select id from ai_video_reports where request_id = ${rep.request_id} limit 1)
      insert into ai_report_scores (report_id, athlete_id, criterion, score, confidence, evidence_count)
      select (select id from rid), ${rep.athlete_id}::uuid, s.criterion, s.score, s.confidence::ai_confidence, s.evidence_count
        from jsonb_to_recordset(${json(scores)}::jsonb) as s(criterion text, score smallint, confidence text, evidence_count smallint)
      on conflict (report_id, criterion) do nothing`);
  }

  async notifyGuardians(athleteId: string, template: NotificationTemplate, payload: Record<string, unknown>) {
    await asService((q) => q`
      insert into notification_outbox (profile_id, channel, template, payload)
      select g.profile_id, 'email', ${template}, ${json({ ...payload, athlete_id: athleteId })}::jsonb
        from athlete_guardians g where g.athlete_id = ${athleteId}`);
  }
}
