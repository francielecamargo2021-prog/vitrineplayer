/**
 * Cliente da API PitchVision (v2), usado SÓ no servidor. A chave fica em PITCHVISION_API_KEY e nunca chega
 * ao navegador. Toda chamada é idempotente do lado da PitchVision (external_ref): repetir não reprocessa.
 */
export type PvMatch = { id: string; status: string; stage: string | null; error: string | null; reused?: boolean };
export type PvRequest = {
  id: string; match_id: string; status: string; stage: string | null; error: string | null;
  identity: { track_ids?: number[]; origin?: string; confirmed_at?: string } | null; has_result?: boolean; reused?: boolean;
};
export type PvCandidate = { track_id: number; team: number; seconds: number; first_t: number; last_t: number; jersey_votes: number; jersey_reads: number };

export type MatchInput = {
  external_ref: string; video_url: string; category: string | null; minors: boolean;
  authorization: { rights_basis: string; declared_by: string; purposes: string[]; age_band: string; category?: string | null; consent_reference?: string };
};
export type AthleteRequestInput = {
  external_ref: string; external_athlete_ref: string;
  clues: { jersey_number: number | null; position: string | null; shirt_color: string | null };
};

export interface PvClient {
  createMatch(input: MatchInput): Promise<PvMatch>;
  getMatch(id: string): Promise<PvMatch>;
  createAthleteRequest(matchId: string, input: AthleteRequestInput): Promise<PvRequest>;
  getRequest(id: string): Promise<PvRequest>;
  getCandidates(id: string): Promise<{ candidates: PvCandidate[]; automatic_identity: boolean }>;
  confirmIdentity(id: string, trackIds: number[]): Promise<PvRequest>;
  getResult(id: string): Promise<unknown>;
  getBinary(id: string, kind: "thumbnail" | "evidence", ref: string): Promise<Response>;
  deleteRequest(id: string): Promise<void>;
}

export class PvError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const ID = /^[A-Za-z0-9]{1,32}$/;
const EVIDENCE = /^(img_best|clip_[1-9]|idcheck_[1-9])$/;
const id = (v: string) => {
  if (!ID.test(v)) throw new PvError(400, "id inválido");
  return v;
};

type Fetch = typeof fetch;

export class HttpPvClient implements PvClient {
  private base: string;
  key: string; // público só para o teste local ler a chave depois que o servidor sobe
  private fetchImpl: Fetch;
  private timeoutMs: number;

  constructor(opts: { baseUrl: string; apiKey: string; fetchImpl?: Fetch; timeoutMs?: number }) {
    if (!/^https:\/\//.test(opts.baseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(opts.baseUrl)) {
      throw new Error("PITCHVISION_API_URL precisa ser https");
    }
    this.base = opts.baseUrl.replace(/\/$/, "");
    this.key = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.base}${path}`, {
      method,
      headers: { "X-API-Key": this.key, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      let detail = "";
      try {
        const j = (await res.json()) as { detail?: unknown };
        detail = typeof j.detail === "string" ? j.detail : "";
      } catch { /* corpo sem JSON */ }
      throw new PvError(res.status, detail || `PitchVision respondeu ${res.status}`);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  createMatch(input: MatchInput) { return this.call<PvMatch>("POST", "/v2/matches", input); }
  getMatch(mid: string) { return this.call<PvMatch>("GET", `/v2/matches/${id(mid)}`); }
  createAthleteRequest(mid: string, input: AthleteRequestInput) {
    return this.call<PvRequest>("POST", `/v2/matches/${id(mid)}/athlete-requests`, input);
  }
  getRequest(rid: string) { return this.call<PvRequest>("GET", `/v2/athlete-requests/${id(rid)}`); }
  getCandidates(rid: string) { return this.call<{ candidates: PvCandidate[]; automatic_identity: boolean }>("GET", `/v2/athlete-requests/${id(rid)}/candidates`); }
  confirmIdentity(rid: string, trackIds: number[]) {
    return this.call<PvRequest>("POST", `/v2/athlete-requests/${id(rid)}/identity`, { track_ids: trackIds });
  }
  getResult(rid: string) { return this.call<unknown>("GET", `/v2/athlete-requests/${id(rid)}/result`); }
  async getBinary(rid: string, kind: "thumbnail" | "evidence", ref: string) {
    if (kind === "thumbnail" && !/^\d{1,9}$/.test(ref)) throw new PvError(400, "trecho inválido");
    if (kind === "evidence" && !EVIDENCE.test(ref)) throw new PvError(400, "evidência inválida");
    const path = kind === "thumbnail" ? `/v2/athlete-requests/${id(rid)}/candidates/${ref}/thumbnail` : `/v2/athlete-requests/${id(rid)}/evidence/${ref}`;
    const res = await this.fetchImpl(`${this.base}${path}`, { headers: { "X-API-Key": this.key }, cache: "no-store", signal: AbortSignal.timeout(this.timeoutMs) });
    if (!res.ok) throw new PvError(res.status, `PitchVision respondeu ${res.status}`);
    return res;
  }
  async deleteRequest(rid: string) { await this.call<void>("DELETE", `/v2/athlete-requests/${id(rid)}`); }
}

/** Configuração do ambiente (null = integração desligada neste ambiente). */
export function pvConfig() {
  const enabled = process.env.PITCHVISION_ENABLED === "true";
  const url = process.env.PITCHVISION_API_URL ?? "";
  const key = process.env.PITCHVISION_API_KEY ?? "";
  if (!enabled || !url || !key) return null;
  return { url, key, webhookSecret: process.env.PITCHVISION_WEBHOOK_SECRET ?? "", refKey: process.env.PITCHVISION_REF_KEY ?? "" };
}

export function pvClient(): PvClient | null {
  const c = pvConfig();
  return c ? new HttpPvClient({ baseUrl: c.url, apiKey: c.key }) : null;
}
