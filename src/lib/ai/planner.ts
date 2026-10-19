/**
 * Divide cada pedido em itens de trabalho. Vídeos curtos = 1 item ("analyze").
 * Vídeos longos = trechos ("segment") analisados separadamente (sem juntar
 * vídeos de atletas diferentes) + 1 item final de consolidação (texto).
 */
import type { JobKind, RequestContext, VideoKind } from "./types.ts";

export type PlannedJob = { kind: JobKind; seq: number; start_s: number; end_s: number; fps: number };

/** Tolerância: até 20% acima do tamanho do trecho ainda vira análise única. */
const SINGLE_TOLERANCE = 1.2;

export function videoRange(r: Pick<RequestContext, "range_start_s" | "range_end_s" | "video_minutes">) {
  const start = r.range_start_s ?? 0;
  const end = Math.max(start + 1, r.range_end_s ?? r.video_minutes * 60);
  return { start, end };
}

/** Quadros por segundo: vídeos curtos (≤ 10 min) a 2 fps para não perder lances rápidos. */
export function fpsFor(videoType: VideoKind, seconds: number) {
  return videoType !== "full_match" && seconds <= 600 ? 2 : 1;
}

export function planJobs(r: Pick<RequestContext, "range_start_s" | "range_end_s" | "video_minutes" | "video_type">, segmentMinutes: number): PlannedJob[] {
  const { start, end } = videoRange(r);
  const total = end - start;
  const seg = segmentMinutes * 60;
  if (total <= seg * SINGLE_TOLERANCE) {
    return [{ kind: "analyze", seq: 0, start_s: start, end_s: end, fps: fpsFor(r.video_type, total) }];
  }
  const n = Math.ceil(total / seg);
  return Array.from({ length: n }, (_, i) => {
    const s = start + i * seg;
    const e = Math.min(end, s + seg);
    return { kind: "segment" as const, seq: i, start_s: s, end_s: e, fps: fpsFor(r.video_type, e - s) };
  });
}
