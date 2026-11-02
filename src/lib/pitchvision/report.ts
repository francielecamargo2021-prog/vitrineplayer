/**
 * Relatório da PitchVision → linha de ai_video_reports (pv_save_report).
 *
 * Regras:
 *  * Só números MEDIDOS entram como "validados"; o que a PitchVision marca como experimental fica separado,
 *    e o que ainda não é medido aparece como indisponível, com o motivo. Nada é estimado ou inventado aqui.
 *  * Sem nota geral, sem notas por fundamento e sem ranking (vale também para a fase formativa).
 *  * Confiança nunca é "alta": a precisão da análise ainda não foi validada em partidas reais.
 *  * Texto montado por modelos de frase (sem IA generativa), em pt-BR ou es.
 */
import { groupFor, type Position } from "../ai/rubric.ts";

export type PvResult = {
  analysis_id: string;
  video: { duration_s?: number; width?: number; height?: number; fps?: number };
  timings?: { video_seconds_processed?: number };
  capabilities?: Record<string, string>;
  limitations?: string[];
  identity_origin?: string | null;
  athlete: {
    identity: { track_id: number; additional_track_ids?: number[]; declared_jersey_number?: string | null };
    observed_seconds: number;
    presence?: { start_t?: number; end_t?: number }[];
    evidence?: { id: string; kind: string; start_t?: number | null; end_t?: number | null; url?: string }[];
  };
  report: {
    validated: Record<string, number | boolean>;
    experimental: Record<string, number | boolean>;
    unavailable: Record<string, string>;
    scores: null;
    external_ai_used: boolean;
    minors: boolean;
  };
};

export type ReportPayload = {
  position_group: string;
  coverage: number;
  confidence: "low" | "medium";
  summary: string;
  strengths: string[];
  development: string[];
  positioning: string | null;
  report: Record<string, unknown>;
};

const T = {
  pt: {
    seen: (m: string, pct: number) => `Atleta acompanhado em ${m} do vídeo (${pct}% do trecho analisado).`,
    who: { user: "A identificação foi confirmada pelo responsável.", auto: "A identificação foi feita automaticamente." },
    noPositions: "Posicionamento em campo indisponível: o vídeo não permitiu calibrar o campo.",
    positions: "Posicionamento em campo disponível para este vídeo.",
  },
  es: {
    seen: (m: string, pct: number) => `Atleta seguido durante ${m} del video (${pct}% del tramo analizado).`,
    who: { user: "La identificación fue confirmada por el responsable.", auto: "La identificación se hizo automáticamente." },
    noPositions: "Posicionamiento en el campo no disponible: el video no permitió calibrar el campo.",
    positions: "Posicionamiento en el campo disponible para este video.",
  },
} as const;

const mmss = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)} min ${String(t % 60).padStart(2, "0")} s`;
};

export function mapResult(result: PvResult, ctx: { position: Position; lang: "pt" | "es" }): ReportPayload {
  const r = result.report;
  if (!r || r.scores !== null || r.external_ai_used !== false) throw new Error("relatório da PitchVision fora do contrato");
  const t = T[ctx.lang];
  const observed = Number(result.athlete.observed_seconds) || 0;
  const analysed = Number(result.timings?.video_seconds_processed ?? result.video.duration_s ?? 0) || 0;
  const coverage = analysed > 0 ? Math.min(1, Math.max(0, observed / analysed)) : 0;
  const pct = Math.round(coverage * 100);
  const origin = result.identity_origin === "auto" ? "auto" : "user";
  const positionsAvailable = r.validated.positions_available === true;
  const summary = [t.seen(mmss(observed), pct), t.who[origin], positionsAvailable ? t.positions : t.noPositions].join(" ");
  return {
    position_group: groupFor(ctx.position),
    coverage: Math.round(coverage * 100) / 100,
    confidence: origin === "user" && coverage >= 0.5 ? "medium" : "low",
    summary,
    strengths: [],    // só com métricas validadas de desempenho (ainda não há): nada de elogio genérico
    development: [],
    positioning: positionsAvailable ? t.positions : null,
    report: {
      provider: "pitchvision",
      contract: "v2",
      validated: r.validated,
      experimental: r.experimental,
      unavailable: r.unavailable,
      minors: r.minors,
      external_ai_used: false,
      identity: {
        origin,
        tracks: [result.athlete.identity.track_id, ...(result.athlete.identity.additional_track_ids ?? [])],
        declared_jersey_number: result.athlete.identity.declared_jersey_number ?? null,
        jersey_verified: false,
      },
      presence: (result.athlete.presence ?? []).slice(0, 200),
      evidence: (result.athlete.evidence ?? []).slice(0, 12).map((e) => ({ id: e.id, kind: e.kind, start_t: e.start_t ?? null, end_t: e.end_t ?? null })),
      video: { duration_s: result.video.duration_s ?? null, analysed_s: analysed || null },
      limitations: (result.limitations ?? []).slice(0, 12),
      accuracy_validated: false,
    },
  };
}
