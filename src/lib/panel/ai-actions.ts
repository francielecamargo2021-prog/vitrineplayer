"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { userDataClient } from "@/lib/db/data-api";
import { currentUser } from "@/lib/auth/server";
import { hasLocale } from "@/i18n/config";
import { ageOn, isFormativeAge, positions, type Position } from "@/domain/athlete";
import { RUBRIC_VERSION } from "@/lib/ai/rubric";
import { PROMPT_VERSION } from "@/lib/ai/prompt";
import type { FormState } from "./actions";

/** Versão do texto de autorização exibido na etapa "Avaliação técnica". */
const AI_CONSENT_VERSION = "ai-2026-10";

const aiVideoTypes = ["highlights", "full_match", "training"] as const;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const int = (v: string, min: number, max: number) => {
  const n = Number(v);
  return v !== "" && Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const safeLang = (lang: string) => (hasLocale(lang) ? lang : "pt");
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

async function authed() {
  if (!(await currentUser())) throw new Error("auth");
  const db = await userDataClient();
  if (!db) throw new Error("backend");
  return db;
}

const refresh = (lang: string, athleteId: string) => {
  revalidatePath(`/${safeLang(lang)}/painel/atleta/${athleteId}`, "layout");
};

/** Erros do banco → mensagens do formulário (nunca mostramos o erro bruto). */
function errorKey(message: string) {
  if (message.includes("request already active")) return "active";
  if (message.includes("no analyses available")) return "noCredit";
  if (message.includes("too many requests")) return "tooMany";
  if (message.includes("formative age")) return "formative";
  return "generic";
}

export async function requestAiAnalysis(lang: string, athleteId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const db = await authed();
  if (str(fd, "consent") !== "yes") return { error: "consent" };
  const media = str(fd, "media_id");
  const videoType = str(fd, "video_type") as (typeof aiVideoTypes)[number];
  const position = str(fd, "position") as Position;
  const minutes = int(str(fd, "video_minutes"), 1, 130);
  const shirt = int(str(fd, "shirt_number"), 0, 99);
  const color = str(fd, "shirt_color").slice(0, 40);
  const from = int(str(fd, "range_from"), 0, 129);
  const to = int(str(fd, "range_to"), 1, 130);
  if (!isUuid(media) || !aiVideoTypes.includes(videoType) || !positions.includes(position) || minutes === null || shirt === null || color.length < 2) {
    return { error: "generic" };
  }
  if ((from !== null && from >= minutes) || (to !== null && (to > minutes || (from !== null && to <= from)))) return { error: "generic" };
  // 6 a 10 anos: sem análise com notas (a regra definitiva vai para o banco na migração da faixa etária)
  const { data: who } = await db.from("athletes").select("birth_date").eq("id", athleteId).maybeSingle();
  if (!who?.birth_date || isFormativeAge(ageOn(who.birth_date))) return { error: "formative" };

  const { error } = await db.rpc("request_ai_analysis", {
    p_media: media, p_video_type: videoType, p_video_minutes: minutes, p_shirt_number: shirt, p_shirt_color: color,
    p_position: position, p_consent_version: AI_CONSENT_VERSION, p_rubric_version: RUBRIC_VERSION, p_prompt_version: PROMPT_VERSION,
    p_range_start_min: from, p_range_end_min: to,
  });
  if (error) return { error: errorKey(error.message) };
  refresh(lang, athleteId);
  return { ok: true };
}

export async function cancelAiAnalysis(lang: string, athleteId: string, requestId: string) {
  const db = await authed();
  await db.rpc("cancel_ai_analysis", { p_request: requestId });
  refresh(lang, athleteId);
}

export async function setAiReportPublished(lang: string, athleteId: string, reportId: string, published: boolean) {
  const db = await authed();
  await db.rpc("set_ai_report_published", { p_report: reportId, p_published: published });
  refresh(lang, athleteId);
}

export async function deleteAiReport(lang: string, athleteId: string, reportId: string) {
  const db = await authed();
  await db.rpc("delete_ai_report", { p_report: reportId });
  refresh(lang, athleteId);
  redirect(`/${safeLang(lang)}/painel/atleta/${athleteId}/editar/avaliacao`);
}
