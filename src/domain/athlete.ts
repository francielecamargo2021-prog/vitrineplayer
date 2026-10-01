/**
 * Modelo de domínio do atleta — espelha supabase/migrations (0001 + 0002).
 * Dados de contato NUNCA fazem parte do atleta: pertencem ao responsável
 * (tabela `profiles`) e não são expostos a profissionais.
 */
import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];
export type AthleteRow = Database["public"]["Tables"]["athletes"]["Row"];
export type MediaRow = Database["public"]["Tables"]["athlete_media"]["Row"];
export type ClubRow = Database["public"]["Tables"]["athlete_clubs"]["Row"];
export type AchievementRow = Database["public"]["Tables"]["athlete_achievements"]["Row"];

export type AthleteStatus = Enums["athlete_status"];
export type Visibility = Enums["profile_visibility"];
export type DominantFoot = Enums["dominant_foot"];
export type Position = Enums["football_position"];
export type Seeking = Enums["seeking_kind"];
export type Availability = Enums["availability_answer"];
export type VideoType = Enums["video_type"];
export type ActivityKind = Enums["activity_kind"];
export type Sex = Enums["athlete_sex"];

/** Ordem de campo (goleiro → ataque). Filtro futuro da busca profissional. */
export const positions: Position[] = ["GK", "RB", "CB", "LB", "DM", "CM", "AM", "RW", "LW", "CF", "ST"];
export const feet: DominantFoot[] = ["right", "left", "both"];
export const sexes: Sex[] = ["male", "female"];
export const availabilityAnswers: Availability[] = ["yes", "no", "open"];
export const videoTypes: VideoType[] = ["highlights", "full_match", "training", "goal_play", "other"];
export const seekingKinds: Seeking[] = [
  "club", "evaluation", "agent", "representation",
  "national_opportunity", "international_opportunity", "sponsorship", "other",
];
/** Mesmas chaves de `athlete_trait_keys()` no banco (autodeclaradas, sem nota). */
export const traitKeys = [
  "speed", "finishing", "vision", "passing", "dribbling", "heading", "marking", "strength",
  "leadership", "positioning", "tackling", "crossing", "reflexes", "distribution", "stamina", "set_pieces",
] as const;
export type TraitKey = (typeof traitKeys)[number];

/** Países atendidos no cadastro (ISO-3166 alfa-2). */
export const countries = ["BR", "AR", "PY", "UY", "CL", "BO", "PE", "CO", "EC", "VE", "PT", "ES", "US"];

export const PHOTO_LIMIT = 12;
export const PHOTO_BUCKET = "athlete-photos";

export const birthYear = (a: Pick<AthleteRow, "birth_date">) => Number(a.birth_date.slice(0, 4));

/** Idade em anos completos na data de referência. */
export function ageOn(birthDate: string, ref = new Date()) {
  const [y, m, d] = birthDate.split("-").map(Number);
  let age = ref.getFullYear() - y;
  if (ref.getMonth() + 1 < m || (ref.getMonth() + 1 === m && ref.getDate() < d)) age--;
  return age;
}

/** Categoria de base pelo ano de nascimento (ano da temporada − ano de nascimento). */
export function categoryFor(birthDate: string, season = new Date().getFullYear()) {
  const n = season - Number(birthDate.slice(0, 4));
  return n >= 21 ? "Adulto" : `Sub-${Math.max(n, 7)}`;
}
export const categories = ["Sub-7", "Sub-9", "Sub-11", "Sub-12", "Sub-13", "Sub-14", "Sub-15", "Sub-16", "Sub-17", "Sub-18", "Sub-19", "Sub-20", "Sub-23", "Adulto"];

/** Extrai o ID de 11 caracteres de links do YouTube (watch, youtu.be, shorts, embed). */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\.|^m\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/)?.[1] ?? null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export interface AthleteBundle {
  athlete: AthleteRow;
  photos: MediaRow[];
  videos: MediaRow[];
  clubs: ClubRow[];
  achievements: AchievementRow[];
}

/**
 * Completude por grupos principais (pesos somam 100). Cada grupo conta a fração
 * dos itens preenchidos; o resultado diz o que falta, sem gamificação.
 */
export const completenessGroups = ["personal", "photos", "physical", "football", "traits", "availability", "videos"] as const;
export type CompletenessGroup = (typeof completenessGroups)[number];

export function completeness({ athlete: a, photos, videos, clubs, achievements }: AthleteBundle) {
  const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== "");
  const groups: Record<CompletenessGroup, { weight: number; checks: boolean[] }> = {
    personal: { weight: 15, checks: [a.full_name, a.sport_name, a.birth_date, a.sex, a.nationality, a.state, a.city].map(filled) },
    photos: { weight: 15, checks: [photos.some((p) => p.is_primary), photos.length >= 3] },
    physical: { weight: 10, checks: [a.height_cm, a.weight_kg, a.foot].map(filled) },
    football: {
      weight: 20,
      checks: [
        filled(a.primary_position), filled(a.secondary_positions), filled(a.category), filled(a.current_club),
        clubs.length > 0 || filled(a.competitions), achievements.length > 0 || filled(a.experiences),
      ],
    },
    traits: { weight: 10, checks: [a.traits.length >= 3, filled(a.bio)] },
    availability: {
      weight: 10,
      checks: [a.available !== null, filled(a.travel), filled(a.relocate_city), filled(a.relocate_state), filled(a.relocate_abroad), filled(a.seeking)],
    },
    videos: { weight: 20, checks: [videos.length >= 1, videos.length >= 2] },
  };
  let total = 0;
  const missing: CompletenessGroup[] = [];
  for (const key of completenessGroups) {
    const g = groups[key];
    const ratio = g.checks.filter(Boolean).length / g.checks.length;
    total += g.weight * ratio;
    if (ratio < 1) missing.push(key);
  }
  return { percent: Math.round(total), missing };
}
