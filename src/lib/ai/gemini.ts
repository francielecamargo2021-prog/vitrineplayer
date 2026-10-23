/**
 * Cliente mínimo da Gemini Batch API (REST, sem SDK). Somente servidor.
 *
 * Formato conferido na documentação oficial (2026-10-19):
 *  - criar:   POST {base}/models/{model}:batchGenerateContent
 *             { batch: { display_name, input_config: { requests: { requests: [{ request, metadata: { key } }] } } } }
 *  - status:  GET  {base}/{batches/ID} → metadata.state ∈ JOB_STATE_{PENDING,RUNNING,SUCCEEDED,FAILED,CANCELLED,EXPIRED}
 *  - result.: response.inlinedResponses (lotes inline) ou response.responsesFile (JSONL)
 *  - lotes expiram após 48 h; resultados ficam 6 semanas; criação NÃO é idempotente
 *    (por isso o pipeline usa display_name = "vp-<id do lote>" e reconcilia antes de reenviar).
 */

export type BatchItem = { key: string; request: unknown };
export type BatchState = "pending" | "running" | "succeeded" | "failed" | "cancelled" | "expired";
export type BatchResult = { key: string; response?: unknown; error?: { code?: number; message?: string } };
export type BatchInfo = { name: string; state: BatchState; displayName?: string; results?: BatchResult[]; error?: string };

export interface BatchClient {
  createBatch(input: { model: string; displayName: string; items: BatchItem[] }): Promise<{ name: string }>;
  getBatch(name: string): Promise<BatchInfo>;
  /** Procura um lote pelo display_name (recuperação após falha entre criar e registrar). */
  findBatch(displayName: string): Promise<{ name: string } | null>;
}

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const DOWNLOAD = "https://generativelanguage.googleapis.com/download/v1beta";

const stateMap: Record<string, BatchState> = {
  JOB_STATE_PENDING: "pending", JOB_STATE_QUEUED: "pending", JOB_STATE_RUNNING: "running",
  JOB_STATE_SUCCEEDED: "succeeded", JOB_STATE_FAILED: "failed", JOB_STATE_CANCELLED: "cancelled", JOB_STATE_EXPIRED: "expired",
  BATCH_STATE_PENDING: "pending", BATCH_STATE_RUNNING: "running", BATCH_STATE_SUCCEEDED: "succeeded",
  BATCH_STATE_FAILED: "failed", BATCH_STATE_CANCELLED: "cancelled", BATCH_STATE_EXPIRED: "expired",
};

type Json = Record<string, unknown>;

/** Normaliza a resposta de status (aceita as variações documentadas). */
export function parseBatch(json: Json): BatchInfo {
  const meta = (json.metadata ?? json) as Json;
  const name = String(meta.name ?? json.name ?? "");
  const rawState = String(meta.state ?? json.state ?? "");
  const state = stateMap[rawState] ?? (json.done ? "succeeded" : "pending");
  const out = (json.response ?? meta.output ?? json.dest ?? {}) as Json;
  let inlined = out.inlinedResponses as unknown;
  if (inlined && !Array.isArray(inlined)) inlined = (inlined as Json).inlinedResponses;
  const results = Array.isArray(inlined)
    ? (inlined as Json[]).map((r) => ({
        key: String((r.metadata as Json | undefined)?.key ?? r.key ?? ""),
        response: r.response,
        error: r.error as BatchResult["error"],
      }))
    : undefined;
  const err = json.error as Json | undefined;
  return { name, state, displayName: meta.displayName as string | undefined, results, error: err ? String(err.message ?? JSON.stringify(err)) : undefined };
}

export class GeminiBatchClient implements BatchClient {
  private readonly apiKey: string;

  /**
   * `allowPaid` precisa ser explicitamente `true`: cada lote enviado gera custo.
   * O pipeline só passa `true` com ai_settings.enabled + AI_ANALYSIS_ENABLED=true.
   */
  constructor(opts: { apiKey: string; allowPaid: boolean; fetchImpl?: typeof fetch }) {
    if (!opts.allowPaid) throw new Error("chamadas pagas ao Gemini não autorizadas");
    if (!opts.apiKey) throw new Error("GEMINI_API_KEY ausente");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }
  private readonly fetchImpl: typeof fetch;

  private async call(url: string, init?: RequestInit) {
    const res = await this.fetchImpl(url, { ...init, headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json", ...init?.headers } });
    const body = await res.text();
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
    return body;
  }

  async createBatch({ model, displayName, items }: { model: string; displayName: string; items: BatchItem[] }) {
    const body = { batch: { display_name: displayName, input_config: { requests: { requests: items.map((i) => ({ request: i.request, metadata: { key: i.key } })) } } } };
    const json = JSON.parse(await this.call(`${BASE}/models/${model}:batchGenerateContent`, { method: "POST", body: JSON.stringify(body) })) as Json;
    const name = String((json.metadata as Json | undefined)?.name ?? json.name ?? "");
    if (!name.startsWith("batches/")) throw new Error(`nome de lote inesperado: ${name}`);
    return { name };
  }

  async getBatch(name: string): Promise<BatchInfo> {
    const json = JSON.parse(await this.call(`${BASE}/${name}`)) as Json;
    const info = parseBatch(json);
    const out = (json.response ?? (json.metadata as Json | undefined)?.output ?? {}) as Json;
    const file = (out.responsesFile ?? (out as Json).responses_file) as string | undefined;
    if (info.state === "succeeded" && !info.results && file) {
      const lines = (await this.call(`${DOWNLOAD}/${file}:download?alt=media`)).split("\n").filter((l) => l.trim());
      info.results = lines.map((l) => {
        const r = JSON.parse(l) as Json;
        return { key: String(r.key ?? (r.metadata as Json | undefined)?.key ?? ""), response: r.response, error: r.error as BatchResult["error"] };
      });
    }
    return info;
  }

  async findBatch(displayName: string) {
    let token = "";
    for (let page = 0; page < 5; page++) {
      const json = JSON.parse(await this.call(`${BASE}/batches?pageSize=100${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`)) as Json;
      const list = (json.batches ?? json.operations ?? []) as Json[];
      for (const b of list) {
        const info = parseBatch(b);
        if (info.displayName === displayName && info.name) return { name: info.name };
      }
      token = String(json.nextPageToken ?? "");
      if (!token) break;
    }
    return null;
  }
}

// ---------------------------------------------------------------- chamada direta ("Processar agora")
/**
 * Uma única requisição generateContent, para o admin processar na hora um vídeo curto.
 * Mesmo formato de requisição dos lotes; a resposta é a mesma que viria dentro do lote.
 */
export type ModelInfo = { name: string; displayName?: string; inputTokenLimit?: number; outputTokenLimit?: number; methods: string[] };

export interface DirectClient {
  /** Confere se o modelo existe e aceita generateContent (consulta gratuita). Nunca troca de modelo. */
  getModel(model: string): Promise<ModelInfo | null>;
  generate(model: string, request: unknown, opts: { timeoutMs: number }): Promise<unknown>;
}

export class GeminiDirectClient implements DirectClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  /** Como o cliente de lotes: só existe com autorização explícita de custo. */
  constructor(opts: { apiKey: string; allowPaid: boolean; fetchImpl?: typeof fetch }) {
    if (!opts.allowPaid) throw new Error("chamadas pagas ao Gemini não autorizadas");
    if (!opts.apiKey) throw new Error("GEMINI_API_KEY ausente");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async getModel(model: string): Promise<ModelInfo | null> {
    if (!/^[a-z0-9.-]+$/.test(model)) return null;
    const res = await this.fetchImpl(`${BASE}/models/${model}`, { headers: { "x-goog-api-key": this.apiKey } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const j = (await res.json()) as Json;
    return {
      name: String(j.name ?? ""),
      displayName: j.displayName as string | undefined,
      inputTokenLimit: j.inputTokenLimit as number | undefined,
      outputTokenLimit: j.outputTokenLimit as number | undefined,
      methods: (j.supportedGenerationMethods as string[] | undefined) ?? [],
    };
  }

  async generate(model: string, request: unknown, { timeoutMs }: { timeoutMs: number }) {
    const res = await this.fetchImpl(`${BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
    return JSON.parse(body) as unknown;
  }
}
