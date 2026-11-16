/**
 * Modo link da PitchVision: link PÚBLICO do YouTube analisado por IA externa (Gemini, plano pago), sem download.
 * SÓ PARA ATLETAS ADULTOS (18+): conferido aqui, na ação do servidor, no banco (0017) e de novo na PitchVision.
 *
 * O relatório não tem contagens nem notas: lista momentos com o tempo do vídeo e o nível de evidência
 * ("IA, não verificado"), para o responsável conferir no player oficial do YouTube e marcar certo/errado.
 */
import { groupFor, type Position } from "../ai/rubric.ts";
import type { ReportPayload } from "./report.ts";

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com"]);

/** Id do vídeo de um link do YouTube (watch, youtu.be, shorts, live, embed) ou null. */
export function youtubeId(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!["https:", "http:"].includes(u.protocol) || !YT_HOSTS.has(u.hostname.toLowerCase())) return null;
  let v: string | null = null;
  if (u.hostname.toLowerCase() === "youtu.be") v = u.pathname.split("/")[1] ?? null;
  else if (u.pathname === "/watch") v = u.searchParams.get("v");
  else {
    const [kind, vid] = u.pathname.split("/").filter(Boolean);
    if (["shorts", "live", "embed"].includes(kind ?? "")) v = vid ?? null;
  }
  return v && YT_ID.test(v) ? v : null;
}

/** "03:12" → 192; null se fora do formato MM:SS (ou H:MM:SS). */
export function parseClock(v: string): number | null {
  const m = /^(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)$/.exec(v.trim());
  if (!m) return null;
  if (m[1] !== undefined && Number(m[2]) >= 60) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export const isAdult = (birthDate: string | null, now = new Date()) => {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;
  const [y, m, d] = birthDate.split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age--;
  return age >= 18;
};

/** Endereço do player oficial sem cookies, começando no segundo do momento. */
export function embedUrl(videoId: string, t: number) {
  if (!YT_ID.test(videoId)) throw new Error("id inválido");
  return `https://www.youtube-nocookie.com/embed/${videoId}?start=${Math.max(0, Math.floor(t))}&rel=0&modestbranding=1`;
}

export type LinkMoment = {
  id: string; t: number; time: string; type: string; team: string | null; player_jersey: number | null; player_name: string | null;
  is_target_athlete: boolean; description: string; evidence_level: "ai_unverified" | "ai_unverified_stable";
};
export type LinkObservation = { id: string; t: number; time: string; description: string; is_target_athlete: boolean; evidence_level: string };

export type PvLinkResult = {
  mode: "link";
  source: { provider: "youtube"; video_id: string; title?: string | null; duration_s?: number | null };
  capabilities?: { external_ai_used?: boolean };
  limitations?: string[];
  report: {
    validated: Record<string, never>; experimental: Record<string, never>; unavailable: Record<string, string>;
    ai_unverified: { moments: LinkMoment[]; observations: LinkObservation[]; target_athlete_found: boolean; stability_checked: boolean };
    scores: null; external_ai_used: true; minors: false;
  };
};

const T = {
  pt: {
    summary: (n: number, found: boolean) => found
      ? `A IA apontou ${n === 1 ? "1 momento" : `${n} momentos`} para conferir no vídeo. Nada aqui foi verificado: confira cada um antes de usar.`
      : "A IA não reconheceu o atleta com segurança neste vídeo. Os momentos abaixo são do jogo, não verificados.",
  },
  es: {
    summary: (n: number, found: boolean) => found
      ? `La IA señaló ${n === 1 ? "1 momento" : `${n} momentos`} para revisar en el video. Nada fue verificado: revisa cada uno antes de usarlo.`
      : "La IA no reconoció al atleta con seguridad en este video. Los momentos son del partido, sin verificar.",
  },
} as const;

/** Resultado do modo link → linha de ai_video_reports. Recusa qualquer coisa fora do contrato (nota, contagem). */
export function mapLinkResult(result: PvLinkResult, ctx: { position: Position; lang: "pt" | "es" }): ReportPayload {
  const r = result.report;
  if (result.mode !== "link" || !r || r.scores !== null || r.external_ai_used !== true || r.minors !== false
    || Object.keys(r.validated ?? {}).length || Object.keys(r.experimental ?? {}).length || !r.ai_unverified) {
    throw new Error("relatório do modo link fora do contrato");
  }
  if (!YT_ID.test(result.source?.video_id ?? "")) throw new Error("relatório do modo link sem vídeo");
  const clean = <T extends { description: string }>(x: T) => ({ ...x, description: String(x.description).slice(0, 300) });
  const moments = r.ai_unverified.moments.slice(0, 200).map(clean).map((m) => ({
    id: m.id, t: m.t, time: m.time, type: m.type, team: m.team, player_jersey: m.player_jersey, player_name: m.player_name,
    is_target_athlete: m.is_target_athlete, description: m.description,
    evidence_level: m.evidence_level === "ai_unverified_stable" ? "ai_unverified_stable" : "ai_unverified",
  }));
  const observations = r.ai_unverified.observations.slice(0, 100).map(clean).map((o) => ({
    id: o.id, t: o.t, time: o.time, description: o.description, is_target_athlete: o.is_target_athlete, evidence_level: "ai_unverified",
  }));
  const mine = moments.filter((m) => m.is_target_athlete).length;
  return {
    position_group: groupFor(ctx.position),
    coverage: 0,                 // nada medido: o modo link não acompanha o atleta quadro a quadro
    confidence: "low",
    summary: T[ctx.lang].summary(mine, r.ai_unverified.target_athlete_found),
    strengths: [],
    development: [],
    positioning: null,
    report: {
      provider: "pitchvision",
      contract: "v2-link",
      mode: "link",
      youtube_id: result.source.video_id,
      title: result.source.title ?? null,
      external_ai_used: true,
      minors: false,
      scores: null,
      moments,
      observations,
      target_athlete_found: r.ai_unverified.target_athlete_found,
      stability_checked: r.ai_unverified.stability_checked,
      unavailable: r.unavailable,
      limitations: (result.limitations ?? []).slice(0, 12),
      accuracy_validated: false,
    },
  };
}

export type LinkFormError = "link" | "clock" | "duration" | "generic";
export type LinkArgs = {
  youtube_id: string; minutes: number; video_type: "full_match" | "highlights"; shirt_number: number; shirt_color: string;
  position: string; appears_at: string | null;
};

/** Campos do formulário do modo link → argumentos de request_pitchvision_link_analysis (ou o motivo da recusa). */
export function parseLinkForm(get: (k: string) => string, positions: readonly string[]): { ok: true; args: LinkArgs } | { ok: false; error: LinkFormError } {
  const id = youtubeId(get("url"));
  if (!id) return { ok: false, error: "link" };
  const minutes = Number(get("minutes"));
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 130) return { ok: false, error: "duration" };
  const appears = get("appears_at").trim();
  if (appears && (parseClock(appears) === null || parseClock(appears)! > minutes * 60)) return { ok: false, error: "clock" };
  const shirt = Number(get("shirt_number"));
  const color = get("shirt_color").trim().slice(0, 40);
  const position = get("position");
  const kind = get("video_type") === "highlights" ? "highlights" : "full_match";
  if (get("shirt_number") === "" || !Number.isInteger(shirt) || shirt < 0 || shirt > 99 || color.length < 2 || !positions.includes(position)) {
    return { ok: false, error: "generic" };
  }
  return { ok: true, args: { youtube_id: id, minutes, video_type: kind, shirt_number: shirt, shirt_color: color, position, appears_at: appears || null } };
}
