/**
 * Validação da saída do modelo e cálculo das notas NO SERVIDOR.
 * O modelo sugere notas; aqui decidimos o que conta: só fundamento com
 * evidência suficiente (lances com minuto dentro do trecho analisado) recebe
 * nota, e a nota geral só existe com cobertura mínima e atleta identificado.
 */
import { groupFor, groupKeys, groups, scoring, type CriterionKey } from "./rubric.ts";
import type { Confidence, FinalReport, ModelCriterion, ModelEvidence, ModelOutput, RequestContext } from "./types.ts";

export class InvalidOutput extends Error {}

const conf = ["low", "medium", "high"] as const;
const confRank: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const list = (v: unknown, maxItems: number, maxLen: number) =>
  Array.isArray(v) ? [...new Set(v.map((x) => text(x, maxLen)).filter(Boolean))].slice(0, maxItems) : [];

/** "MM:SS" ou "H:MM:SS" → segundos. */
export function parseTimestamp(t: string): number | null {
  const m = /^(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)$/.exec(t.trim());
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Texto JSON de uma GenerateContentResponse (ignora partes de raciocínio). */
export function responseText(response: unknown): string {
  const r = response as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
  if (r?.promptFeedback?.blockReason) throw new InvalidOutput(`bloqueado: ${r.promptFeedback.blockReason}`);
  const c = r?.candidates?.[0];
  if (!c) throw new InvalidOutput("resposta sem candidatos");
  if (c.finishReason && !["STOP", "FINISH_REASON_UNSPECIFIED"].includes(c.finishReason)) throw new InvalidOutput(`finishReason ${c.finishReason}`);
  const out = (c.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
  if (!out.trim()) throw new InvalidOutput("resposta vazia");
  return out;
}

/**
 * Valida e saneia a saída. Fundamentos fora da rubrica são descartados;
 * evidências fora do trecho [start, end] (±5 s) ou sem minuto válido também.
 */
export function parseModelOutput(raw: string, keys: CriterionKey[], range: { start: number; end: number }): ModelOutput {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new InvalidOutput("JSON inválido");
  }
  if (!data || typeof data !== "object") throw new InvalidOutput("JSON não é objeto");
  const id = (data.identification ?? {}) as Record<string, unknown>;
  const status = ["confirmed", "uncertain", "not_found"].includes(id.status as string) ? (id.status as ModelOutput["identification"]["status"]) : null;
  if (!status) throw new InvalidOutput("identificação ausente");

  const seen = new Set<string>();
  const crit: ModelCriterion[] = [];
  for (const c of Array.isArray(data.criteria) ? (data.criteria as Record<string, unknown>[]) : []) {
    const key = c?.key as CriterionKey;
    if (!keys.includes(key) || seen.has(key)) continue;
    seen.add(key);
    const evidence: ModelEvidence[] = (Array.isArray(c.evidence) ? (c.evidence as Record<string, unknown>[]) : [])
      .map((e) => ({ t: text(e?.t, 9), note: text(e?.note, 240) }))
      .map((e) => ({ ...e, s: parseTimestamp(e.t) ?? -1 }))
      .filter((e) => e.note && e.s >= range.start - 5 && e.s <= range.end + 5)
      .slice(0, 8);
    const score = Number.isInteger(c.score) && (c.score as number) >= 1 && (c.score as number) <= 5 ? (c.score as number) : null;
    crit.push({
      key,
      observed: c.observed === true && score !== null,
      score,
      confidence: conf.includes(c.confidence as Confidence) ? (c.confidence as Confidence) : "low",
      evidence,
      comment: text(c.comment, 400),
    });
  }
  // fundamentos da rubrica que o modelo omitiu entram como não observados
  for (const key of keys) if (!seen.has(key)) crit.push({ key, observed: false, score: null, confidence: "low", evidence: [], comment: "" });

  return {
    identification: { status, notes: text(id.notes, 400), timestamps: list(id.timestamps, 10, 9) },
    video_quality: ["good", "fair", "poor"].includes(data.video_quality as string) ? (data.video_quality as ModelOutput["video_quality"]) : "fair",
    criteria: keys.map((k) => crit.find((c) => c.key === k)!),
    strengths: list(data.strengths, 4, 200),
    development: list(data.development, 4, 200),
    decision_making: text(data.decision_making, 600) || null,
    positioning: text(data.positioning, 600) || null,
    summary: text(data.summary, 1200),
  };
}

/** Um fundamento conta para nota quando foi observado com evidência suficiente. */
export const counts = (c: ModelCriterion) => c.observed && c.score !== null && c.evidence.length >= scoring.minEvidence;

export type Outcome = { kind: "unidentified"; output: ModelOutput } | { kind: "report"; report: FinalReport };

export function buildReport(output: ModelOutput, r: RequestContext, video: { start_s: number; end_s: number; segments: number }): Outcome {
  if (output.identification.status !== "confirmed") return { kind: "unidentified", output };

  const group = groupFor(r.position);
  const weights = groups[group].weights;
  const totalWeight = groupKeys(group).reduce((s, k) => s + (weights[k] ?? 0), 0);
  const rows = output.criteria.map((c) => ({ ...c, weight: weights[c.key] ?? 0, counted: counts(c) }));
  const counted = rows.filter((c) => c.counted);
  const observedWeight = counted.reduce((s, c) => s + c.weight, 0);
  const coverage = Math.round((observedWeight / totalWeight) * 100) / 100;

  const overall = coverage >= scoring.minCoverageForOverall && observedWeight > 0
    ? Math.round((counted.reduce((s, c) => s + c.score! * c.weight, 0) / observedWeight) * 10) / 10
    : null;

  // Confiança geral: média das confianças dos fundamentos contados, limitada por
  // cobertura, qualidade do vídeo e tipo (melhores momentos nunca passam de "média").
  let rank = counted.length ? Math.round(counted.reduce((s, c) => s + confRank[c.confidence], 0) / counted.length) : 1;
  if (coverage < scoring.minCoverageForOverall || output.video_quality === "poor") rank = 1;
  if (r.video_type === "highlights") rank = Math.min(rank, 2);
  const confidence = conf[Math.max(0, Math.min(2, rank - 1))];

  const strip = (c: ModelCriterion) => (counts(c) ? c : { ...c, observed: false, score: null });

  return {
    kind: "report",
    report: {
      request_id: r.id,
      athlete_id: r.athlete_id,
      media_id: r.media_id,
      video_type: r.video_type,
      position: r.position,
      position_group: group,
      category: r.category,
      rubric_version: r.rubric_version,
      model: r.model,
      overall_score: overall,
      coverage,
      confidence,
      summary: output.summary,
      strengths: output.strengths,
      development: output.development,
      decision_notes: output.decision_making,
      positioning_notes: output.positioning,
      report: {
        version: 1,
        rubric_version: r.rubric_version,
        prompt_version: r.prompt_version,
        model: r.model,
        video: { youtube_id: r.youtube_id, type: r.video_type, start_s: video.start_s, end_s: video.end_s, segments: video.segments },
        identification: output.identification,
        video_quality: output.video_quality,
        criteria: rows.map((c) => ({ ...strip(c), weight: c.weight, counted: c.counted })),
        overall_score: overall,
        coverage,
        confidence,
      },
      scores: counted.map((c) => ({ criterion: c.key, score: c.score!, confidence: c.confidence, evidence_count: c.evidence.length })),
    },
  };
}
