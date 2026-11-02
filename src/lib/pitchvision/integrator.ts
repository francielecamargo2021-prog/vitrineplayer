/**
 * Integração VitrinePlayer → PitchVision (lado do servidor).
 *
 * Um ciclo (`runPvCycle`, chamado pelo agendador e também usado como reserva dos avisos) faz:
 *  1. ENVIAR: pedidos PitchVision na fila ganham uma URL assinada e temporária do vídeo (Blob privado),
 *     uma partida (external_ref = id do vídeo: o mesmo arquivo nunca é processado duas vezes) e um pedido de
 *     atleta (external_ref = id do pedido). Tudo idempotente: se o ciclo cair no meio, repetir não duplica.
 *  2. ACOMPANHAR: pedidos em andamento consultam a etapa real na PitchVision (sem progresso inventado).
 *     Concluído → busca o resultado, monta o relatório (report.ts) e grava UMA vez (pv_save_report).
 *
 * `applyRequest` também é chamado pelo webhook, com o mesmo efeito (a ordem dos eventos não importa).
 */
import { mapResult, type PvResult } from "./report.ts";
import type { PvClient, PvMatch, PvRequest } from "./client.ts";
import type { Position } from "../ai/rubric.ts";

export type Stage = "sent" | "receiving_video" | "processing_match" | "athlete_pick" | "athlete_metrics" | "completed" | "failed";

export type ToSend = {
  request_id: string; athlete_id: string; video_id: string; blob_pathname: string; video_type: string;
  shirt_number: number | null; shirt_color: string | null; athlete_position: string; birth_year: number | null; category: string | null;
};
export type InProgress = {
  request_id: string; athlete_id: string; pv_match_id: string; pv_request_id: string; pv_stage: string | null;
  position: string; report_locale: string;
};

export interface PvRepo {
  requestsToSend(limit: number): Promise<ToSend[]>;
  linkRequest(requestId: string, matchId: string, pvRequestId: string, stage: Stage): Promise<boolean>;
  inProgress(limit: number): Promise<InProgress[]>;
  byPvRequest(pvRequestId: string): Promise<InProgress | null>;
  byPvMatch(pvMatchId: string): Promise<InProgress[]>;
  setStage(pvRequestId: string, stage: Stage, status?: "failed", error?: string): Promise<void>;
  saveReport(pvRequestId: string, payload: ReturnType<typeof mapResult>): Promise<string | null>;
  notifyGuardians(athleteId: string, template: string, payload: Record<string, unknown>): Promise<void>;
}

export interface VideoSigner {
  /** URL assinada de LEITURA do arquivo privado, válida por `validForMs`. */
  presignGet(pathname: string, validForMs: number): Promise<string>;
}

export const SIGNED_URL_MS = 24 * 60 * 60 * 1000;

export function stageFor(req: Pick<PvRequest, "status">, match: Pick<PvMatch, "status"> | null): Stage | null {
  if (req.status === "completed") return "completed";
  if (req.status === "failed" || match?.status === "failed") return "failed";
  if (req.status === "awaiting_input") return "athlete_pick";
  if (req.status === "queued" || req.status === "running") return "athlete_metrics";
  if (req.status === "waiting_match") return match?.status === "ingesting" ? "receiving_video" : "processing_match";
  return null; // "deleted" e estados desconhecidos não mudam nada aqui
}

const minorsFor = (birthYear: number | null, now: Date) => birthYear === null || now.getUTCFullYear() - birthYear < 18;

export async function sendOne(r: ToSend, deps: { repo: PvRepo; client: PvClient; signer: VideoSigner; athleteRef: (id: string) => string; now?: Date }) {
  const now = deps.now ?? new Date();
  const url = await deps.signer.presignGet(r.blob_pathname, SIGNED_URL_MS);
  const age = r.birth_year === null ? null : now.getUTCFullYear() - r.birth_year;
  const match = await deps.client.createMatch({
    external_ref: `vid_${r.video_id.replace(/-/g, "")}`,
    video_url: url,
    category: r.category,
    minors: minorsFor(r.birth_year, now),
    authorization: {
      rights_basis: "guardian_consent", declared_by: "Responsável (VitrinePlayer)", purposes: ["individual_report"],
      age_band: age !== null && age < 16 ? "under_16_present" : "unknown", category: r.category,
      consent_reference: `vitrineplayer:ai_analysis_requests/${r.request_id}`,
    },
  });
  const req = await deps.client.createAthleteRequest(match.id, {
    external_ref: `req_${r.request_id.replace(/-/g, "")}`,
    external_athlete_ref: deps.athleteRef(r.athlete_id),
    clues: { jersey_number: r.shirt_number, position: r.athlete_position, shirt_color: r.shirt_color },
  });
  const linked = await deps.repo.linkRequest(r.request_id, match.id, req.id, stageFor(req, match) ?? "sent");
  return { match, req, linked };
}

export async function applyRequest(row: InProgress, req: PvRequest, match: PvMatch | null, deps: { repo: PvRepo; client: PvClient }) {
  const stage = stageFor(req, match);
  const prev = row.pv_stage; // lido antes de gravar: o aviso depende da etapa ANTERIOR
  if (stage === null) return "ignored";
  if (stage === "completed") {
    const result = (await deps.client.getResult(req.id)) as PvResult;
    const payload = mapResult(result, { position: row.position as Position, lang: row.report_locale.startsWith("es") ? "es" : "pt" });
    const reportId = await deps.repo.saveReport(req.id, payload);
    if (reportId && prev !== "completed") await deps.repo.notifyGuardians(row.athlete_id, "ai_report_ready", { request_id: row.request_id, provider: "pitchvision" });
    return "completed";
  }
  if (stage === "failed") {
    await deps.repo.setStage(req.id, "failed", "failed", req.error ?? match?.error ?? "falha na análise");
    if (prev !== "failed") await deps.repo.notifyGuardians(row.athlete_id, "ai_analysis_failed", { request_id: row.request_id, provider: "pitchvision" });
    return "failed";
  }
  if (stage !== prev) {
    await deps.repo.setStage(req.id, stage);
    if (stage === "athlete_pick") await deps.repo.notifyGuardians(row.athlete_id, "pv_athlete_pick", { request_id: row.request_id });
  }
  return stage;
}

export type CycleSummary = { sent: number; updated: number; completed: number; failed: number; errors: number };

export async function runPvCycle(deps: {
  repo: PvRepo; client: PvClient; signer: VideoSigner; athleteRef: (id: string) => string; now?: Date; limit?: number;
  onError?: (where: "send" | "poll", requestId: string, e: unknown) => void;
}): Promise<CycleSummary> {
  const sum: CycleSummary = { sent: 0, updated: 0, completed: 0, failed: 0, errors: 0 };
  const limit = deps.limit ?? 10;
  for (const r of await deps.repo.requestsToSend(limit)) {
    try {
      if ((await sendOne(r, deps)).linked) sum.sent++;
    } catch (e) {
      deps.onError?.("send", r.request_id, e);
      sum.errors++; // fica na fila; tenta de novo no próximo ciclo (a PitchVision não duplica pelo external_ref)
    }
  }
  const matches = new Map<string, PvMatch | null>();
  for (const row of await deps.repo.inProgress(limit * 5)) {
    try {
      const req = await deps.client.getRequest(row.pv_request_id);
      if (!matches.has(row.pv_match_id)) matches.set(row.pv_match_id, req.status === "waiting_match" ? await deps.client.getMatch(row.pv_match_id) : null);
      const out = await applyRequest(row, req, matches.get(row.pv_match_id) ?? null, deps);
      if (out === "completed") sum.completed++;
      else if (out === "failed") sum.failed++;
      else if (out !== "ignored") sum.updated++;
    } catch (e) {
      deps.onError?.("poll", row.request_id, e);
      sum.errors++;
    }
  }
  return sum;
}

/** Aviso da PitchVision (já com assinatura conferida e evento registrado uma única vez). */
export async function applyEvent(ev: { type: string; data: Record<string, unknown> }, deps: { repo: PvRepo; client: PvClient }) {
  if (ev.type === "athlete_request.updated") {
    const req = ev.data as unknown as PvRequest;
    const row = await deps.repo.byPvRequest(req.id);
    if (!row) return "unknown_request";
    const match = req.status === "waiting_match" ? await deps.client.getMatch(row.pv_match_id) : null;
    return applyRequest(row, req, match, deps);
  }
  if (ev.type === "match.updated") {
    const match = ev.data as unknown as PvMatch;
    for (const row of await deps.repo.byPvMatch(match.id)) {
      const req = await deps.client.getRequest(row.pv_request_id);
      await applyRequest(row, req, match, deps);
    }
    return "match";
  }
  return "ignored";
}
