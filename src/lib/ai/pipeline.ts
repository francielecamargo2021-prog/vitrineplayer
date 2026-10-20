/**
 * Pipeline de avaliação por IA em LOTES (Gemini Batch API, 50% do preço).
 *
 * Um ciclo (`runCycle`, chamado periodicamente) faz, nesta ordem:
 *  1. planejar: pedidos liberados ('queued') ganham seus itens (1 por vídeo
 *     curto; trechos + consolidação para vídeos longos);
 *  2. acompanhar: consulta lotes abertos e aplica resultados por chave
 *     (chave = id do item → pedido → atleta), com controle de duplicidade;
 *  3. enviar: monta um lote quando há itens pendentes e (a) o lote encheu,
 *     (b) o item mais antigo já esperou `max_wait_hours`, ou (c) há
 *     consolidação pendente — sempre dentro do orçamento diário e mensal.
 *
 * Nada é enviado sem: ai_settings.enabled, autorização do ambiente e cliente
 * configurado. Os testes usam repositório e cliente simulados.
 */
import { planJobs, videoRange } from "./planner.ts";
import { buildConsolidateRequest, buildVideoRequest } from "./prompt.ts";
import { costFromUsage, estimateJob, round4 } from "./pricing.ts";
import { InvalidOutput, buildReport, parseModelOutput, responseText } from "./report.ts";
import { groupFor, groupKeys } from "./rubric.ts";
import type { BatchClient, BatchResult } from "./gemini.ts";
import type { Batch, FinalReport, Job, ModelOutput, RequestContext, RequestStatus, Settings, Usage } from "./types.ts";

export type JobWithRequest = Job & { request: RequestContext };
export type NotificationTemplate = "ai_report_ready" | "ai_analysis_unidentified" | "ai_analysis_failed";

/** Operações de banco usadas pelo pipeline (implementação real: repo-db.ts). */
export interface AiRepo {
  getSettings(): Promise<Settings>;
  requestsToPlan(limit: number): Promise<RequestContext[]>;
  insertJobs(requestId: string, jobs: { kind: Job["kind"]; seq: number; start_s: number; end_s: number; estimated_cost_usd: number }[]): Promise<void>;
  setRequestEstimate(requestId: string, usd: number): Promise<void>;
  pendingJobs(limit: number, maxAttempts: number): Promise<JobWithRequest[]>;
  /** Custo real desde `since` + estimativa dos itens ainda em processamento. */
  spentSince(since: Date): Promise<number>;
  createBatch(row: { id: string; model: string; item_count: number; estimated_cost_usd: number }): Promise<void>;
  updateBatch(id: string, patch: Partial<Pick<Batch, "status" | "provider_name">> & { error?: string; submitted_at?: string; completed_at?: string }): Promise<void>;
  openBatches(): Promise<Batch[]>;
  /** pendente → enviado (+1 tentativa), só para itens ainda pendentes. Retorna os ids efetivamente reservados. */
  claimJobs(ids: string[], batchId: string): Promise<string[]>;
  /** enviado → pendente (nova tentativa) ou → falhou (tentativas esgotadas). */
  releaseJobs(ids: string[], error: string, maxAttempts: number): Promise<{ job_id: string; request_id: string; failed: boolean }[]>;
  batchJobs(batchId: string): Promise<JobWithRequest[]>;
  requestJobs(requestId: string): Promise<Job[]>;
  /** Conclui o item uma única vez (enviado + mesmo lote) e soma o custo no pedido/lote. */
  completeJob(id: string, batchId: string, data: { result: ModelOutput; input_tokens: number; output_tokens: number; cost_usd: number }): Promise<boolean>;
  /** Soma custo de um item cuja resposta não pôde ser usada (os tokens foram cobrados). */
  addJobCost(id: string, batchId: string, usage: { input_tokens: number; output_tokens: number; cost_usd: number }): Promise<void>;
  cancelJobs(requestId: string): Promise<void>;
  getRequestStatus(requestId: string): Promise<RequestStatus | null>;
  /** Muda o status de um pedido que ainda não terminou (nunca sobrescreve cancelado/concluído). */
  setRequestStatus(requestId: string, status: RequestStatus, error?: string): Promise<void>;
  saveReport(report: FinalReport): Promise<void>;
  notifyGuardians(athleteId: string, template: NotificationTemplate, payload: Record<string, unknown>): Promise<void>;
}

export type CycleSummary = { planned: number; applied: number; failed: number; submitted: number; batches: number; skipped?: string };

const DISPLAY_PREFIX = "vp-";
const RECONCILE_AFTER_MS = 15 * 60_000;

const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const startOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

export async function runCycle(deps: {
  repo: AiRepo;
  client: BatchClient | null;
  /** Autorização do ambiente (AI_ANALYSIS_ENABLED=true). */
  paidAllowed: boolean;
  now?: Date;
  newId?: () => string;
}): Promise<CycleSummary> {
  const { repo, client, paidAllowed } = deps;
  const now = deps.now ?? new Date();
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const s = await repo.getSettings();
  const summary: CycleSummary = { planned: 0, applied: 0, failed: 0, submitted: 0, batches: 0 };

  summary.planned = await planQueued(repo, s, now);
  if (client) await pollBatches(repo, client, s, now, summary);

  if (!s.enabled) summary.skipped = "disabled_in_settings";
  else if (!paidAllowed) summary.skipped = "disabled_in_environment";
  else if (!client) summary.skipped = "no_api_key";
  else await submitDue(repo, client, s, now, newId, summary);
  return summary;
}

// ---------------------------------------------------------------- 1. planejar
async function planQueued(repo: AiRepo, s: Settings, now: Date) {
  const requests = await repo.requestsToPlan(100);
  for (const r of requests) {
    const plan = planJobs(r, s.segment_minutes);
    const jobs = plan.map((j) => ({ ...j, estimated_cost_usd: estimateJob(r.model, j, now).costUsd }));
    let total = jobs.reduce((t, j) => t + j.estimated_cost_usd, 0);
    if (plan.length > 1) total += estimateJob(r.model, { kind: "consolidate", start_s: 0, end_s: 0, fps: 1, segments: plan.length }, now).costUsd;
    await repo.insertJobs(r.id, jobs.map(({ kind, seq, start_s, end_s, estimated_cost_usd }) => ({ kind, seq, start_s, end_s, estimated_cost_usd })));
    await repo.setRequestEstimate(r.id, round4(total));
  }
  return requests.length;
}

// ---------------------------------------------------------------- 2. acompanhar lotes
async function pollBatches(repo: AiRepo, client: BatchClient, s: Settings, now: Date, summary: CycleSummary) {
  for (const b of await repo.openBatches()) {
    if (b.status === "creating") {
      await reconcileCreating(repo, client, s, b, now, summary);
      continue;
    }
    if (!b.provider_name) continue;
    let info;
    try {
      info = await client.getBatch(b.provider_name);
    } catch {
      continue; // falha transitória de consulta: tenta no próximo ciclo
    }
    if (info.state === "pending" || info.state === "running") continue;

    const jobs = await repo.batchJobs(b.id);
    if (info.state !== "succeeded") {
      await failJobs(repo, s, jobs, `lote ${info.state}${info.error ? `: ${info.error}` : ""}`, summary);
      await repo.updateBatch(b.id, { status: info.state, error: info.error, completed_at: now.toISOString() });
      continue;
    }

    const byId = new Map(jobs.map((j) => [j.id, j]));
    const answered = new Set<string>();
    for (const result of info.results ?? []) {
      const job = byId.get(result.key);
      if (!job || answered.has(job.id)) continue; // chave desconhecida (ex.: vídeo removido) ou repetida
      answered.add(job.id);
      await applyResult(repo, s, job, b.id, result, now, summary);
    }
    const missing = jobs.filter((j) => !answered.has(j.id));
    if (missing.length) await failJobs(repo, s, missing, "sem resposta no lote", summary);
    await repo.updateBatch(b.id, { status: "succeeded", completed_at: now.toISOString() });
  }
}

/** Lote ficou em 'creating' (queda entre criar no provedor e registrar aqui). */
async function reconcileCreating(repo: AiRepo, client: BatchClient, s: Settings, b: Batch, now: Date, summary: CycleSummary) {
  if (now.getTime() - Date.parse(b.created_at) < RECONCILE_AFTER_MS) return;
  const found = await client.findBatch(DISPLAY_PREFIX + b.id).catch(() => null);
  if (found) {
    await repo.updateBatch(b.id, { status: "submitted", provider_name: found.name, submitted_at: now.toISOString() });
    return;
  }
  await failJobs(repo, s, await repo.batchJobs(b.id), "lote não confirmado pelo provedor", summary);
  await repo.updateBatch(b.id, { status: "failed", error: "não encontrado no provedor", completed_at: now.toISOString() });
}

async function applyResult(repo: AiRepo, s: Settings, job: JobWithRequest, batchId: string, result: BatchResult, now: Date, summary: CycleSummary) {
  const status = await repo.getRequestStatus(job.request_id);
  if (status === null || status === "cancelled") {
    await repo.cancelJobs(job.request_id);
    return; // pedido cancelado ou vídeo removido: resultado descartado
  }
  if (result.error || !result.response) {
    await failJobs(repo, s, [job], `erro do provedor: ${result.error?.message ?? "sem resposta"}`, summary);
    return;
  }
  const usage = costFromUsage(job.request.model, ((result.response as { usageMetadata?: Usage }).usageMetadata ?? {}), now);
  const r = job.request;
  const range = job.kind === "consolidate" ? videoRange(r) : { start: job.start_s ?? 0, end: job.end_s ?? r.video_minutes * 60 };

  let output: ModelOutput;
  try {
    output = parseModelOutput(responseText(result.response), groupKeys(groupFor(r.position)), range);
  } catch (e) {
    await repo.addJobCost(job.id, batchId, { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, cost_usd: usage.costUsd });
    await failJobs(repo, s, [job], e instanceof InvalidOutput ? `saída inválida: ${e.message}` : String(e), summary);
    return;
  }

  const first = await repo.completeJob(job.id, batchId, { result: output, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, cost_usd: usage.costUsd });
  if (!first) return; // resultado duplicado: já aplicado
  summary.applied++;

  if (job.kind === "segment") {
    const jobs = await repo.requestJobs(r.id);
    const segments = jobs.filter((j) => j.kind === "segment");
    if (segments.some((j) => j.status !== "succeeded")) return; // aguardando outros trechos
    const identified = segments.some((j) => (j.result as ModelOutput | null)?.identification.status === "confirmed");
    if (!identified) {
      await finishUnidentified(repo, r);
      return;
    }
    if (!jobs.some((j) => j.kind === "consolidate")) {
      const est = estimateJob(r.model, { kind: "consolidate", start_s: 0, end_s: 0, fps: 1, segments: segments.length }, now).costUsd;
      await repo.insertJobs(r.id, [{ kind: "consolidate", seq: 0, start_s: range.start, end_s: range.end, estimated_cost_usd: est }]);
    }
    return;
  }

  const { start, end } = videoRange(r);
  const segments = job.kind === "consolidate" ? (await repo.requestJobs(r.id)).filter((j) => j.kind === "segment").length : 1;
  const outcome = buildReport(output, r, { start_s: start, end_s: end, segments });
  if (outcome.kind === "unidentified") {
    await finishUnidentified(repo, r);
    return;
  }
  await repo.saveReport(outcome.report);
  await repo.setRequestStatus(r.id, "completed");
  await repo.notifyGuardians(r.athlete_id, "ai_report_ready", { request_id: r.id });
}

async function finishUnidentified(repo: AiRepo, r: RequestContext) {
  await repo.setRequestStatus(r.id, "unidentified");
  await repo.notifyGuardians(r.athlete_id, "ai_analysis_unidentified", { request_id: r.id });
}

/** Devolve itens para nova tentativa; com tentativas esgotadas, o pedido falha. */
async function failJobs(repo: AiRepo, s: Settings, jobs: JobWithRequest[], error: string, summary: CycleSummary) {
  if (!jobs.length) return;
  const released = await repo.releaseJobs(jobs.map((j) => j.id), error.slice(0, 500), s.max_attempts);
  const failedRequests = new Set(released.filter((x) => x.failed).map((x) => x.request_id));
  for (const requestId of failedRequests) {
    summary.failed++;
    const athlete = jobs.find((j) => j.request_id === requestId)!.request.athlete_id;
    await repo.cancelJobs(requestId);
    await repo.setRequestStatus(requestId, "failed", error.slice(0, 500));
    await repo.notifyGuardians(athlete, "ai_analysis_failed", { request_id: requestId });
  }
}

// ---------------------------------------------------------------- 3. enviar lote
async function submitDue(repo: AiRepo, client: BatchClient, s: Settings, now: Date, newId: () => string, summary: CycleSummary) {
  const pending = (await repo.pendingJobs(s.max_items_per_batch, s.max_attempts)).filter((j) => j.request.model === s.model);
  if (!pending.length) {
    summary.skipped = "nothing_pending";
    return;
  }
  const oldest = Math.min(...pending.map((j) => Date.parse(j.created_at)));
  const due = pending.length >= s.max_items_per_batch
    || now.getTime() - oldest >= s.max_wait_hours * 3_600_000
    || pending.some((j) => j.kind === "consolidate");
  if (!due) {
    summary.skipped = "waiting_for_batch_window";
    return;
  }

  const remaining = Math.min(
    s.daily_budget_usd - (await repo.spentSince(startOfDay(now))),
    s.monthly_budget_usd - (await repo.spentSince(startOfMonth(now))),
  );
  const chosen: JobWithRequest[] = [];
  let est = 0;
  for (const j of pending) {
    if (est + j.estimated_cost_usd > remaining) break;
    chosen.push(j);
    est += j.estimated_cost_usd;
  }
  if (!chosen.length) {
    summary.skipped = "budget_exhausted";
    return;
  }

  const batchId = newId();
  await repo.createBatch({ id: batchId, model: s.model, item_count: chosen.length, estimated_cost_usd: round4(est) });
  const claimed = new Set(await repo.claimJobs(chosen.map((j) => j.id), batchId));
  const jobs = chosen.filter((j) => claimed.has(j.id));
  if (!jobs.length) {
    await repo.updateBatch(batchId, { status: "cancelled", error: "itens já reservados por outro ciclo" });
    return;
  }

  const items = [];
  const jobsCache = new Map<string, Job[]>();
  const jobsOf = async (requestId: string) => {
    if (!jobsCache.has(requestId)) jobsCache.set(requestId, await repo.requestJobs(requestId));
    return jobsCache.get(requestId)!;
  };
  for (const j of jobs) {
    const r = j.request;
    if (j.kind === "consolidate") {
      const segs = (await jobsOf(r.id)).filter((x) => x.kind === "segment" && x.status === "succeeded");
      items.push({ key: j.id, request: buildConsolidateRequest(r, segs.map((x) => ({ seq: x.seq, start_s: x.start_s ?? 0, end_s: x.end_s ?? 0, output: x.result as ModelOutput }))) });
    } else {
      const total = (await jobsOf(r.id)).filter((x) => x.kind === "segment").length;
      const { start, end } = j.kind === "analyze" && j.start_s === null ? videoRange(r) : { start: j.start_s ?? 0, end: j.end_s ?? 0 };
      const fps = planJobs(r, s.segment_minutes).find((p) => p.seq === j.seq)?.fps ?? 1;
      items.push({ key: j.id, request: buildVideoRequest(r, { kind: j.kind, seq: j.seq, start_s: start, end_s: end, fps }, total) });
    }
  }

  try {
    const { name } = await client.createBatch({ model: s.model, displayName: DISPLAY_PREFIX + batchId, items });
    await repo.updateBatch(batchId, { status: "submitted", provider_name: name, submitted_at: now.toISOString() });
    for (const requestId of new Set(jobs.map((j) => j.request_id))) await repo.setRequestStatus(requestId, "processing");
    summary.submitted += jobs.length;
    summary.batches++;
  } catch (e) {
    await failJobs(repo, s, jobs, `falha ao criar lote: ${String(e).slice(0, 300)}`, summary);
    await repo.updateBatch(batchId, { status: "failed", error: String(e).slice(0, 500), completed_at: now.toISOString() });
  }
}
