import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AiRepo, JobWithRequest, NotificationTemplate } from "./pipeline.ts";
import type { Batch, FinalReport, Job, RequestContext, RequestStatus, Settings } from "./types.ts";

/**
 * Repositório do pipeline com a service role (ignora RLS). Usado SOMENTE pelo
 * processador no servidor; a chave nunca chega ao navegador.
 */
export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

const REQUEST_COLS =
  "id, athlete_id, media_id, status, video_type, youtube_id, video_minutes, range_start_s, range_end_s, shirt_number, shirt_color, position, category, birth_year, report_locale, rubric_version, prompt_version, model";
const JOB_COLS = "id, request_id, kind, seq, start_s, end_s, status, batch_id, attempts, estimated_cost_usd, result, created_at";

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

const num = (v: unknown) => Number(v ?? 0);
const toJob = (j: Record<string, unknown>): Job => ({ ...(j as unknown as Job), estimated_cost_usd: num(j.estimated_cost_usd) });

export class SupabaseAiRepo implements AiRepo {
  constructor(private readonly db: SupabaseClient) {}

  async getSettings(): Promise<Settings> {
    const s = must(await this.db.from("ai_settings").select("*").single()) as Record<string, unknown>;
    return {
      enabled: Boolean(s.enabled), model: String(s.model),
      daily_budget_usd: num(s.daily_budget_usd), monthly_budget_usd: num(s.monthly_budget_usd),
      max_items_per_batch: num(s.max_items_per_batch), max_wait_hours: num(s.max_wait_hours),
      max_attempts: num(s.max_attempts), segment_minutes: num(s.segment_minutes),
    };
  }

  async requestsToPlan(limit: number) {
    const queued = must(await this.db.from("ai_analysis_requests").select(REQUEST_COLS).eq("status", "queued").order("queued_at").limit(limit)) as RequestContext[];
    if (!queued.length) return [];
    const withJobs = must(await this.db.from("ai_analysis_jobs").select("request_id").in("request_id", queued.map((r) => r.id))) as { request_id: string }[];
    const has = new Set(withJobs.map((j) => j.request_id));
    return queued.filter((r) => !has.has(r.id));
  }

  async insertJobs(requestId: string, jobs: { kind: Job["kind"]; seq: number; start_s: number; end_s: number; estimated_cost_usd: number }[]) {
    must(await this.db.from("ai_analysis_jobs").upsert(jobs.map((j) => ({ ...j, request_id: requestId })), { onConflict: "request_id,kind,seq", ignoreDuplicates: true }));
  }

  async setRequestEstimate(requestId: string, usd: number) {
    must(await this.db.from("ai_analysis_requests").update({ estimated_cost_usd: usd }).eq("id", requestId));
  }

  async pendingJobs(limit: number, maxAttempts: number): Promise<JobWithRequest[]> {
    const rows = must(await this.db.from("ai_analysis_jobs")
      .select(`${JOB_COLS}, request:ai_analysis_requests!inner(${REQUEST_COLS})`)
      .eq("status", "pending").lt("attempts", maxAttempts).in("request.status", ["queued", "processing"])
      .order("created_at").limit(limit)) as Record<string, unknown>[];
    return rows.map((r) => ({ ...toJob(r), request: r.request as RequestContext }));
  }

  async spentSince(since: Date) {
    return num(must(await this.db.rpc("ai_spent_since", { p_since: since.toISOString() })));
  }

  async createBatch(row: { id: string; model: string; item_count: number; estimated_cost_usd: number }) {
    must(await this.db.from("ai_batches").insert({ ...row, status: "creating" }));
  }

  async updateBatch(id: string, patch: Record<string, unknown>) {
    must(await this.db.from("ai_batches").update(patch).eq("id", id));
  }

  async openBatches(): Promise<Batch[]> {
    const rows = must(await this.db.from("ai_batches").select("*").in("status", ["creating", "submitted"]).order("created_at")) as Record<string, unknown>[];
    return rows.map((b) => ({ ...(b as unknown as Batch), estimated_cost_usd: num(b.estimated_cost_usd), cost_usd: num(b.cost_usd) }));
  }

  async claimJobs(ids: string[], batchId: string) {
    return (must(await this.db.rpc("ai_claim_jobs", { p_ids: ids, p_batch: batchId })) as string[] | { ai_claim_jobs: string }[])
      .map((x) => (typeof x === "string" ? x : x.ai_claim_jobs));
  }

  async releaseJobs(ids: string[], error: string, maxAttempts: number) {
    return must(await this.db.rpc("ai_release_jobs", { p_ids: ids, p_error: error, p_max_attempts: maxAttempts })) as { job_id: string; request_id: string; failed: boolean }[];
  }

  async batchJobs(batchId: string): Promise<JobWithRequest[]> {
    const rows = must(await this.db.from("ai_analysis_jobs")
      .select(`${JOB_COLS}, request:ai_analysis_requests!inner(${REQUEST_COLS})`)
      .eq("batch_id", batchId).eq("status", "submitted")) as Record<string, unknown>[];
    return rows.map((r) => ({ ...toJob(r), request: r.request as RequestContext }));
  }

  async requestJobs(requestId: string) {
    return (must(await this.db.from("ai_analysis_jobs").select(JOB_COLS).eq("request_id", requestId).order("kind").order("seq")) as Record<string, unknown>[]).map(toJob);
  }

  async completeJob(id: string, batchId: string, d: { result: unknown; input_tokens: number; output_tokens: number; cost_usd: number }) {
    return Boolean(must(await this.db.rpc("ai_complete_job", {
      p_job: id, p_batch: batchId, p_result: d.result, p_input: d.input_tokens, p_output: d.output_tokens, p_cost: d.cost_usd,
    })));
  }

  async addJobCost(id: string, batchId: string, u: { input_tokens: number; output_tokens: number; cost_usd: number }) {
    must(await this.db.rpc("ai_add_job_cost", { p_job: id, p_batch: batchId, p_input: u.input_tokens, p_output: u.output_tokens, p_cost: u.cost_usd }));
  }

  async cancelJobs(requestId: string) {
    must(await this.db.from("ai_analysis_jobs").update({ status: "cancelled" }).eq("request_id", requestId).eq("status", "pending"));
  }

  async getRequestStatus(requestId: string) {
    const row = must(await this.db.from("ai_analysis_requests").select("status").eq("id", requestId).maybeSingle()) as { status: RequestStatus } | null;
    return row?.status ?? null;
  }

  async setRequestStatus(requestId: string, status: RequestStatus, error?: string) {
    must(await this.db.rpc("ai_set_request_status", { p_request: requestId, p_status: status, p_error: error ?? null }));
  }

  async saveReport(r: FinalReport) {
    const { scores, ...report } = r;
    const saved = must(await this.db.from("ai_video_reports").upsert(report, { onConflict: "request_id", ignoreDuplicates: true }).select("id")) as { id: string }[];
    const id = saved[0]?.id ?? (must(await this.db.from("ai_video_reports").select("id").eq("request_id", r.request_id).single()) as { id: string }).id;
    if (scores.length) {
      must(await this.db.from("ai_report_scores").upsert(scores.map((x) => ({ ...x, report_id: id, athlete_id: r.athlete_id })), { onConflict: "report_id,criterion", ignoreDuplicates: true }));
    }
  }

  async notifyGuardians(athleteId: string, template: NotificationTemplate, payload: Record<string, unknown>) {
    const guardians = must(await this.db.from("athlete_guardians").select("profile_id").eq("athlete_id", athleteId)) as { profile_id: string }[];
    if (!guardians.length) return;
    must(await this.db.from("notification_outbox").insert(guardians.map((g) => ({
      profile_id: g.profile_id, channel: "email", template, payload: { ...payload, athlete_id: athleteId },
    }))));
  }
}
