"use server";

import { revalidatePath } from "next/cache";
import { userDataClient } from "@/lib/db/data-api";
import { asService } from "@/lib/db";
import { currentUser } from "@/lib/auth/server";
import { hasLocale } from "@/i18n/config";
import { positions, type Position } from "@/domain/athlete";
import { pvClient } from "@/lib/pitchvision/client";
import { MAX_VIDEO_BYTES, VIDEO_TYPES, deleteVideo, isVideoPath, newVideoPath, uploadToken, verifyUploaded, videosReady } from "@/lib/videos/server";
import type { FormState } from "./actions";

/** Versão do texto de autorização da análise PitchVision exibido no painel. */
const PV_CONSENT_VERSION = "pv-2026-11";
const PV_VERSION = "pitchvision-v2";
const videoKinds = ["full_match", "highlights", "training"] as const;

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const safeLang = (lang: string) => (hasLocale(lang) ? lang : "pt");
const refresh = (lang: string, athleteId: string) => revalidatePath(`/${safeLang(lang)}/painel/atleta/${athleteId}`, "layout");

/** Usuário logado + cliente de dados com a RLS dele; confere que o atleta é DELE (RLS de athletes). */
async function ownAthlete(athleteId: string) {
  if (!isUuid(athleteId)) return null;
  const user = await currentUser();
  const db = await userDataClient();
  if (!user || !db) return null;
  const { data } = await db.from("athletes").select("id").eq("id", athleteId).maybeSingle();
  return data ? { user, db } : null;
}

export type UploadStart = { ok: true; pathname: string; clientToken: string; validUntil: number } | { ok: false; error: string };

/** Autoriza o envio de UM arquivo (caminho, tipo e tamanho fixos no token). `resumePathname`: continuar. */
export async function startVideoUpload(athleteId: string, file: { size: number; type: string }, resumePathname?: string): Promise<UploadStart> {
  if (!videosReady()) return { ok: false, error: "generic" };
  const own = await ownAthlete(athleteId);
  if (!own) return { ok: false, error: "generic" };
  if (!VIDEO_TYPES[file.type]) return { ok: false, error: "type" };
  if (!Number.isInteger(file.size) || file.size <= 0 || file.size > MAX_VIDEO_BYTES) return { ok: false, error: "size" };
  const { count } = await own.db.from("analysis_videos").select("id", { count: "exact", head: true }).eq("athlete_id", athleteId).eq("status", "uploaded");
  if ((count ?? 0) >= 5) return { ok: false, error: "many" };
  const pathname = resumePathname && isVideoPath(athleteId, resumePathname) ? resumePathname : newVideoPath(athleteId, file.type);
  const { clientToken, validUntil } = await uploadToken(pathname, file.type, file.size);
  return { ok: true, pathname, clientToken, validUntil };
}

/** Depois do envio: confere o arquivo no Blob e o registra no banco (como o responsável). */
export async function finishVideoUpload(lang: string, athleteId: string, v: { pathname: string; size: number; type: string; durationS: number; videoType: string }) {
  const own = await ownAthlete(athleteId);
  if (!own || !isVideoPath(athleteId, v.pathname)) return { ok: false, error: "generic" };
  if (!videoKinds.includes(v.videoType as (typeof videoKinds)[number])) return { ok: false, error: "generic" };
  const duration = Math.round(v.durationS);
  if (!Number.isFinite(duration) || duration < 30 || duration > 7800) return { ok: false, error: "duration" };
  if (!(await verifyUploaded(v.pathname, v.size, v.type))) return { ok: false, error: "verify" };
  const { error } = await own.db.rpc("register_analysis_video", {
    p_athlete: athleteId, p_pathname: v.pathname, p_content_type: v.type, p_size: v.size, p_duration_s: duration,
    p_video_type: v.videoType as (typeof videoKinds)[number],
  });
  if (error) return { ok: false, error: error.message.includes("too many videos") ? "many" : "generic" };
  refresh(lang, athleteId);
  return { ok: true };
}

export async function removeAnalysisVideo(lang: string, athleteId: string, videoId: string): Promise<FormState> {
  const own = await ownAthlete(athleteId);
  if (!own || !isUuid(videoId)) return { error: "generic" };
  const { data, error } = await own.db.rpc("delete_analysis_video", { p_video: videoId });
  if (error) return { error: error.message.includes("video in use") ? "inUse" : "generic" };
  if (typeof data === "string" && isVideoPath(athleteId, data)) await deleteVideo(data).catch(() => undefined);
  refresh(lang, athleteId);
  return { ok: true };
}

function requestError(message: string) {
  if (message.includes("analysis disabled")) return "disabled";
  if (message.includes("request already active")) return "active";
  if (message.includes("no analyses available")) return "noCredit";
  if (message.includes("too many requests")) return "tooMany";
  if (message.includes("formative age")) return "formative";
  return "generic";
}

export async function requestPvAnalysis(lang: string, athleteId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const own = await ownAthlete(athleteId);
  if (!own) return { error: "generic" };
  if (String(fd.get("consent") ?? "") !== "yes") return { error: "consent" };
  const video = String(fd.get("video_id") ?? "");
  const shirt = Number(fd.get("shirt_number"));
  const color = String(fd.get("shirt_color") ?? "").trim().slice(0, 40);
  const position = String(fd.get("position") ?? "") as Position;
  if (!isUuid(video) || !Number.isInteger(shirt) || shirt < 0 || shirt > 99 || !positions.includes(position)) return { error: "generic" };
  const { error } = await own.db.rpc("request_pitchvision_analysis", {
    p_video: video, p_shirt_number: shirt, p_shirt_color: color, p_position: position,
    p_consent_version: PV_CONSENT_VERSION, p_rubric_version: PV_VERSION, p_prompt_version: PV_VERSION,
  });
  if (error) return { error: requestError(error.message) };
  refresh(lang, athleteId);
  return { ok: true };
}

/** Escolha visual (uma vez): só o responsável, só quando a PitchVision espera a escolha. */
export async function confirmAthletePick(lang: string, athleteId: string, requestId: string, trackId: number) {
  const own = await ownAthlete(athleteId);
  const client = pvClient();
  if (!own || !client || !isUuid(requestId) || !Number.isInteger(trackId) || trackId < 0) return;
  const { data: req } = await own.db.from("ai_analysis_requests").select("pv_request_id, pv_stage, athlete_id")
    .eq("id", requestId).eq("provider", "pitchvision").maybeSingle();
  if (!req?.pv_request_id || req.athlete_id !== athleteId || req.pv_stage !== "athlete_pick") return;
  await client.confirmIdentity(req.pv_request_id, [trackId]);
  await asService((q) => q`select pv_set_stage(${req.pv_request_id}, 'athlete_metrics')`);
  refresh(lang, athleteId);
}

/** "Nenhum destes": cancela o pedido (o crédito volta) e apaga o pedido na PitchVision. */
export async function cancelPvAnalysis(lang: string, athleteId: string, requestId: string) {
  const own = await ownAthlete(athleteId);
  if (!own || !isUuid(requestId)) return;
  const { data: req } = await own.db.from("ai_analysis_requests").select("pv_request_id, athlete_id").eq("id", requestId).eq("provider", "pitchvision").maybeSingle();
  if (!req || req.athlete_id !== athleteId) return;
  const { error } = await own.db.rpc("cancel_ai_analysis", { p_request: requestId });
  if (!error && req.pv_request_id) await pvClient()?.deleteRequest(req.pv_request_id).catch(() => undefined);
  refresh(lang, athleteId);
}
