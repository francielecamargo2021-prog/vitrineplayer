/**
 * Calibração do campo para a PitchVision (câmera fixa): o responsável toca 4 ou mais pontos conhecidos do campo
 * (cantos, meio-campo, grande área) num quadro do jogo. Aqui só se valida e se monta o pedido; a conta (homografia
 * ou spline, erro de validação, recusa de pontos trocados) é feita pela PitchVision.
 * Sem rede e sem banco: testado em tests/calibration.test.ts.
 */
import { PvError, type CalibrationInput, type PvClient } from "./client.ts";

export const MIN_POINTS = 4;
export const MAX_POINTS = 13;
/** Largura do quadro pedido à PitchVision (o celular amplia ou reduz; os pontos voltam nesta escala). */
export const FRAME_WIDTH = 1280;

/** Ordem sugerida: primeiro os pontos que quase toda câmera fixa vê. */
export const LANDMARKS = [
  "corner_far_left", "corner_far_right", "corner_near_left", "corner_near_right",
  "halfway_far", "halfway_near", "centre_spot",
  "box_left_far", "box_left_near", "box_right_far", "box_right_near", "circle_far", "circle_near",
] as const;
export type Landmark = (typeof LANDMARKS)[number];
export const isLandmark = (v: string): v is Landmark => (LANDMARKS as readonly string[]).includes(v);

export type MarkedPoint = { landmark: Landmark; x: number; y: number };
export type Frame = { t: number; width: number; height: number };
export type BuildError = "few" | "many" | "duplicate" | "outside" | "unknown" | "frame";

/** Valida os pontos tocados (no quadro de `frame.width` x `frame.height`) e monta o corpo para a PitchVision. */
export function buildCalibration(points: MarkedPoint[], frame: Frame, available: readonly string[]):
  { ok: true; input: CalibrationInput } | { ok: false; error: BuildError } {
  if (!Number.isFinite(frame.t) || frame.t < 0 || !Number.isInteger(frame.width) || !Number.isInteger(frame.height)
    || frame.width < 16 || frame.height < 16 || frame.width > 8000 || frame.height > 8000) return { ok: false, error: "frame" };
  if (points.length < MIN_POINTS) return { ok: false, error: "few" };
  if (points.length > MAX_POINTS) return { ok: false, error: "many" };
  const seen = new Set<string>();
  for (const p of points) {
    if (!isLandmark(p.landmark) || !available.includes(p.landmark)) return { ok: false, error: "unknown" };
    if (seen.has(p.landmark)) return { ok: false, error: "duplicate" };
    seen.add(p.landmark);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > frame.width || p.y > frame.height) {
      return { ok: false, error: "outside" };
    }
  }
  return {
    ok: true,
    input: {
      t: Math.round(frame.t * 10) / 10, frame_width: frame.width, frame_height: frame.height, recompute: false,
      points: points.map((p) => ({ image: [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10], landmark: p.landmark })),
    },
  };
}

export type CalibrationError = "swapped" | "collinear" | "outside" | "moving" | "unstable" | "notReady" | "generic";

/** Resposta de recusa da PitchVision → mensagem do dicionário (o texto original não é exibido como veio). */
export function calibrationError(status: number, detail: string): CalibrationError {
  const d = detail.toLowerCase();
  if (status === 409 && d.includes("câmera")) return "moving";
  if (status === 409) return "notReady";
  if (status !== 422) return "generic";
  if (d.includes("trocad") || d.includes("impossível")) return "swapped";
  if (d.includes("em linha") || d.includes("mesma linha") || d.includes("alinhados")) return "collinear";
  if (d.includes("fora")) return "outside";
  if (d.includes("instável") || d.includes("não se encaixam")) return "unstable";
  return "generic";
}

/** Instantes oferecidos para escolher um quadro em que as linhas do campo apareçam bem. */
export function frameTimes(durationS: number): number[] {
  const d = Number.isFinite(durationS) && durationS > 0 ? durationS : 60;
  return [0.1, 0.35, 0.6].map((f) => Math.max(0, Math.round(d * f)));
}

/** Posição (0–1) de cada ponto no desenho do campo, a partir das medidas que a PitchVision usa. */
export function diagramPositions(landmarks: Record<string, [number, number]>, pitch: { length_m: number; width_m: number }) {
  const out: Partial<Record<Landmark, { x: number; y: number }>> = {};
  for (const k of LANDMARKS) {
    const v = landmarks[k];
    if (v) out[k] = { x: v[0] / pitch.length_m, y: v[1] / pitch.width_m };
  }
  return out;
}

export type CalibrationRequestRow = { athlete_id: string; status: string; pv_stage: string | null; pv_match_id: string | null };
export type SubmitResult =
  | { ok: true; method: string; points: number; error_m: number | null }
  | { ok: false; error: BuildError | CalibrationError | "notAllowed" };

/**
 * Núcleo da ação do servidor (sem Next e sem banco, para teste): só o pedido DESTE atleta, só enquanto espera a
 * escolha do atleta (partida pronta). Os pontos disponíveis vêm da PitchVision (medidas do campo pela categoria).
 */
export async function submitCalibrationFor(
  row: CalibrationRequestRow | null, athleteId: string, points: MarkedPoint[], frame: Frame,
  client: Pick<PvClient, "getCalibrationInfo" | "submitCalibration">,
): Promise<SubmitResult> {
  if (!row || row.athlete_id !== athleteId || row.status !== "processing" || row.pv_stage !== "athlete_pick" || !row.pv_match_id) {
    return { ok: false, error: "notAllowed" };
  }
  try {
    const info = await client.getCalibrationInfo(row.pv_match_id);
    const built = buildCalibration(points, frame, Object.keys(info.landmarks));
    if (!built.ok) return built;
    const out = await client.submitCalibration(row.pv_match_id, built.input);
    const q = out.calibration.quality;
    return { ok: true, method: q.method, points: q.points, error_m: q.loo_mean_m ?? null };
  } catch (e) {
    if (e instanceof PvError) return { ok: false, error: calibrationError(e.status, e.message) };
    return { ok: false, error: "generic" };
  }
}
