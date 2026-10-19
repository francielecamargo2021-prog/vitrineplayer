/** Repositório em memória e cliente Gemini simulado — nenhum custo, nenhuma rede. */
import type { AiRepo, JobWithRequest, NotificationTemplate } from "../pipeline.ts";
import type { BatchClient, BatchInfo, BatchItem, BatchResult } from "../gemini.ts";
import type { Batch, FinalReport, Job, ModelOutput, RequestContext, RequestStatus, Settings } from "../types.ts";
import { RUBRIC_VERSION } from "../rubric.ts";
import { PROMPT_VERSION } from "../prompt.ts";

let seq = 0;
export const id = (p: string) => `${p}-${++seq}`;

export function request(over: Partial<RequestContext> = {}): RequestContext {
  return {
    id: id("req"), athlete_id: id("ath"), media_id: id("med"), status: "queued", video_type: "highlights",
    youtube_id: "dQw4w9WgXcQ", video_minutes: 4, range_start_s: null, range_end_s: null,
    shirt_number: 10, shirt_color: "azul", position: "ST", category: "Sub-15", birth_year: 2011,
    report_locale: "pt-BR", rubric_version: RUBRIC_VERSION, prompt_version: PROMPT_VERSION, model: "gemini-3.8-flash",
    ...over,
  };
}

export const settings = (over: Partial<Settings> = {}): Settings => ({
  enabled: true, model: "gemini-3.8-flash", daily_budget_usd: 5, monthly_budget_usd: 50,
  max_items_per_batch: 50, max_wait_hours: 6, max_attempts: 3, segment_minutes: 15, ...over,
});

export class MemoryRepo implements AiRepo {
  s: Settings;
  requests = new Map<string, RequestContext & { estimated_cost_usd?: number; cost_usd: number; error?: string }>();
  jobs = new Map<string, Job & { input_tokens: number; output_tokens: number; cost_usd: number; error?: string; completed_at?: string }>();
  batches = new Map<string, Batch & { error?: string }>();
  reports: FinalReport[] = [];
  notifications: { athleteId: string; template: NotificationTemplate; payload: Record<string, unknown> }[] = [];
  clock = () => new Date().toISOString();

  constructor(s: Settings = settings()) { this.s = s; }
  add(r: RequestContext) { this.requests.set(r.id, { ...r, cost_usd: 0 }); return r; }

  async getSettings() { return this.s; }
  async requestsToPlan(limit: number) {
    const planned = new Set([...this.jobs.values()].map((j) => j.request_id));
    return [...this.requests.values()].filter((r) => r.status === "queued" && !planned.has(r.id)).slice(0, limit);
  }
  async insertJobs(requestId: string, jobs: { kind: Job["kind"]; seq: number; start_s: number; end_s: number; estimated_cost_usd: number }[]) {
    for (const j of jobs) {
      if ([...this.jobs.values()].some((x) => x.request_id === requestId && x.kind === j.kind && x.seq === j.seq)) continue;
      const jid = id("job");
      this.jobs.set(jid, { id: jid, request_id: requestId, status: "pending", batch_id: null, attempts: 0, result: null, created_at: this.clock(), input_tokens: 0, output_tokens: 0, cost_usd: 0, ...j });
    }
  }
  async setRequestEstimate(requestId: string, usd: number) { this.requests.get(requestId)!.estimated_cost_usd = usd; }
  private withReq = (j: Job): JobWithRequest => ({ ...j, request: this.requests.get(j.request_id)! });
  async pendingJobs(limit: number, maxAttempts: number) {
    return [...this.jobs.values()]
      .filter((j) => j.status === "pending" && j.attempts < maxAttempts && ["queued", "processing"].includes(this.requests.get(j.request_id)?.status ?? ""))
      .sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, limit).map(this.withReq);
  }
  async spentSince() {
    return [...this.jobs.values()].reduce((t, j) => t + j.cost_usd + (j.status === "submitted" && j.cost_usd === 0 ? j.estimated_cost_usd : 0), 0);
  }
  async createBatch(row: { id: string; model: string; item_count: number; estimated_cost_usd: number }) {
    this.batches.set(row.id, { ...row, provider_name: null, status: "creating", cost_usd: 0, created_at: this.clock() });
  }
  async updateBatch(bid: string, patch: Record<string, unknown>) { Object.assign(this.batches.get(bid)!, patch); }
  async openBatches() { return [...this.batches.values()].filter((b) => b.status === "creating" || b.status === "submitted"); }
  async claimJobs(ids: string[], batchId: string) {
    const out: string[] = [];
    for (const jid of ids) {
      const j = this.jobs.get(jid)!;
      if (j.status !== "pending" || !["queued", "processing"].includes(this.requests.get(j.request_id)!.status)) continue;
      Object.assign(j, { status: "submitted", batch_id: batchId, attempts: j.attempts + 1 });
      out.push(jid);
    }
    return out;
  }
  async releaseJobs(ids: string[], error: string, maxAttempts: number) {
    return ids.map((jid) => this.jobs.get(jid)!).filter((j) => j.status === "submitted").map((j) => {
      const failed = j.attempts >= maxAttempts;
      Object.assign(j, { status: failed ? "failed" : "pending", batch_id: failed ? j.batch_id : null, error });
      return { job_id: j.id, request_id: j.request_id, failed };
    });
  }
  async batchJobs(batchId: string) { return [...this.jobs.values()].filter((j) => j.batch_id === batchId && j.status === "submitted").map(this.withReq); }
  async requestJobs(requestId: string) { return [...this.jobs.values()].filter((j) => j.request_id === requestId); }
  async completeJob(jid: string, batchId: string, d: { result: ModelOutput; input_tokens: number; output_tokens: number; cost_usd: number }) {
    const j = this.jobs.get(jid);
    if (!j || j.status !== "submitted" || j.batch_id !== batchId) return false;
    Object.assign(j, { status: "succeeded", result: d.result, input_tokens: j.input_tokens + d.input_tokens, output_tokens: j.output_tokens + d.output_tokens, cost_usd: j.cost_usd + d.cost_usd });
    this.requests.get(j.request_id)!.cost_usd += d.cost_usd;
    this.batches.get(batchId)!.cost_usd += d.cost_usd;
    return true;
  }
  async addJobCost(jid: string, batchId: string, u: { input_tokens: number; output_tokens: number; cost_usd: number }) {
    const j = this.jobs.get(jid)!;
    j.cost_usd += u.cost_usd;
    this.requests.get(j.request_id)!.cost_usd += u.cost_usd;
    this.batches.get(batchId)!.cost_usd += u.cost_usd;
  }
  async cancelJobs(requestId: string) {
    for (const j of this.jobs.values()) if (j.request_id === requestId && j.status === "pending") j.status = "cancelled";
  }
  async getRequestStatus(requestId: string) { return this.requests.get(requestId)?.status ?? null; }
  async setRequestStatus(requestId: string, status: RequestStatus, error?: string) {
    const r = this.requests.get(requestId);
    if (r && ["queued", "processing"].includes(r.status)) Object.assign(r, { status, error });
  }
  async saveReport(report: FinalReport) { if (!this.reports.some((r) => r.request_id === report.request_id)) this.reports.push(report); }
  async notifyGuardians(athleteId: string, template: NotificationTemplate, payload: Record<string, unknown>) {
    this.notifications.push({ athleteId, template, payload });
  }
}

/** Gemini simulado: registra lotes e devolve respostas definidas pelo teste. */
export class FakeGemini implements BatchClient {
  created: { name: string; model: string; displayName: string; items: BatchItem[] }[] = [];
  states = new Map<string, BatchInfo["state"]>();
  results = new Map<string, BatchResult[]>();
  failCreate = false;
  async createBatch(input: { model: string; displayName: string; items: BatchItem[] }) {
    if (this.failCreate) throw new Error("rede indisponível");
    const name = `batches/fake-${this.created.length + 1}`;
    this.created.push({ name, ...input });
    this.states.set(name, "running");
    return { name };
  }
  async getBatch(name: string): Promise<BatchInfo> {
    return { name, state: this.states.get(name) ?? "running", results: this.results.get(name) };
  }
  async findBatch(displayName: string) {
    const b = this.created.find((x) => x.displayName === displayName);
    return b ? { name: b.name } : null;
  }
  /** Conclui o lote respondendo cada item com `respond(item)`. */
  finish(name: string, respond: (item: BatchItem) => BatchResult["response"] | { error: string }) {
    const b = this.created.find((x) => x.name === name)!;
    this.states.set(name, "succeeded");
    this.results.set(name, b.items.map((it) => {
      const r = respond(it) as { error?: string };
      return r && "error" in r && typeof r.error === "string" ? { key: it.key, error: { message: r.error } } : { key: it.key, response: r };
    }));
  }
}

/** Resposta no formato GenerateContentResponse com o JSON da avaliação. */
export function modelResponse(output: unknown, usage = { promptTokenCount: 60000, candidatesTokenCount: 3000, thoughtsTokenCount: 6000 }) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] }, finishReason: "STOP" }], usageMetadata: usage };
}

/** Saída de modelo coerente para um atacante, com evidências dentro de 0–4 min. */
export function strikerOutput(over: Record<string, unknown> = {}) {
  const ev = (a: string, b: string) => [{ t: a, note: "lance observado" }, { t: b, note: "outro lance" }];
  return {
    identification: { status: "confirmed", notes: "camisa 10 azul visível", timestamps: ["00:12"] },
    video_quality: "good",
    criteria: [
      { key: "finishing", observed: true, score: 4, confidence: "high", evidence: ev("00:20", "01:10"), comment: "boa finalização" },
      { key: "off_ball_movement", observed: true, score: 4, confidence: "medium", evidence: ev("00:40", "02:05"), comment: "" },
      { key: "first_touch", observed: true, score: 3, confidence: "medium", evidence: ev("00:50", "03:00"), comment: "" },
      { key: "heading", observed: false, score: null, confidence: "low", evidence: [], comment: "não apareceu" },
      { key: "link_play", observed: true, score: 3, confidence: "low", evidence: [{ t: "01:30", note: "só um lance" }], comment: "" },
      { key: "decision_making", observed: true, score: 3, confidence: "medium", evidence: ev("01:00", "02:30"), comment: "" },
    ],
    strengths: ["Finalização com as duas pernas"],
    development: ["Jogo aéreo não observado"],
    decision_making: "Escolhas coerentes nos lances vistos.",
    positioning: null,
    summary: "Atacante com boa finalização nos lances observados.",
    ...over,
  };
}
