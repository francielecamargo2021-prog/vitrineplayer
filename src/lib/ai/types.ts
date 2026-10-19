/** Tipos compartilhados do pipeline de avaliação por IA (sem dependências de framework). */
import type { CriterionKey, Position } from "./rubric.ts";

export type VideoKind = "highlights" | "full_match" | "training";
export type Confidence = "low" | "medium" | "high";
export type JobKind = "analyze" | "segment" | "consolidate";
export type JobStatus = "pending" | "submitted" | "succeeded" | "failed" | "cancelled";
export type RequestStatus = "awaiting_payment" | "queued" | "processing" | "completed" | "unidentified" | "failed" | "cancelled";
export type BatchStatus = "creating" | "submitted" | "succeeded" | "failed" | "expired" | "cancelled";

export type Settings = {
  enabled: boolean;
  model: string;
  daily_budget_usd: number;
  monthly_budget_usd: number;
  max_items_per_batch: number;
  max_wait_hours: number;
  max_attempts: number;
  segment_minutes: number;
};

/** Contexto do pedido usado para montar o prompt e o relatório. */
export type RequestContext = {
  id: string;
  athlete_id: string;
  media_id: string;
  status: RequestStatus;
  video_type: VideoKind;
  youtube_id: string;
  video_minutes: number;
  range_start_s: number | null;
  range_end_s: number | null;
  shirt_number: number;
  shirt_color: string;
  position: Position;
  category: string | null;
  birth_year: number | null;
  report_locale: "pt-BR" | "es";
  rubric_version: string;
  prompt_version: string;
  model: string;
};

export type Job = {
  id: string;
  request_id: string;
  kind: JobKind;
  seq: number;
  start_s: number | null;
  end_s: number | null;
  status: JobStatus;
  batch_id: string | null;
  attempts: number;
  estimated_cost_usd: number;
  result: unknown;
  created_at: string;
};

export type Batch = {
  id: string;
  provider_name: string | null;
  model: string;
  status: BatchStatus;
  item_count: number;
  estimated_cost_usd: number;
  cost_usd: number;
  created_at: string;
};

export type Usage = { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };

/** Saída do modelo já validada e saneada. */
export type ModelEvidence = { t: string; s: number; note: string };
export type ModelCriterion = {
  key: CriterionKey;
  observed: boolean;
  score: number | null;
  confidence: Confidence;
  evidence: ModelEvidence[];
  comment: string;
};
export type ModelOutput = {
  identification: { status: "confirmed" | "uncertain" | "not_found"; notes: string; timestamps: string[] };
  video_quality: "good" | "fair" | "poor";
  criteria: ModelCriterion[];
  strengths: string[];
  development: string[];
  decision_making: string | null;
  positioning: string | null;
  summary: string;
};

/** Relatório final gravado em ai_video_reports (+ notas em ai_report_scores). */
export type FinalReport = {
  request_id: string;
  athlete_id: string;
  media_id: string;
  video_type: VideoKind;
  position: Position;
  position_group: string;
  category: string | null;
  rubric_version: string;
  model: string;
  overall_score: number | null;
  coverage: number;
  confidence: Confidence;
  summary: string;
  strengths: string[];
  development: string[];
  decision_notes: string | null;
  positioning_notes: string | null;
  report: ReportDocument;
  scores: { criterion: CriterionKey; score: number; confidence: Confidence; evidence_count: number }[];
};

export type ReportDocument = {
  version: 1;
  rubric_version: string;
  prompt_version: string;
  model: string;
  video: { youtube_id: string; type: VideoKind; start_s: number; end_s: number; segments: number };
  identification: ModelOutput["identification"];
  video_quality: ModelOutput["video_quality"];
  criteria: (ModelCriterion & { weight: number; counted: boolean })[];
  overall_score: number | null;
  coverage: number;
  confidence: Confidence;
};
