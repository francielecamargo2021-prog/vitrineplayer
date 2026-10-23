/**
 * Faixa de idade por tipo de organização e finalidade do interesse — espelha a migração 0015.
 * Serve só para a tela explicar e filtrar opções: quem decide é o banco
 * (org_age_min/org_age_max, guard_org_age, guard_interest_purpose).
 */
export const BAND_MAX = 22;

/** Piso de cada tipo: o admin nunca autoriza abaixo dele. */
export function ageFloor(kind: string): number {
  if (kind === "school" || kind === "club" || kind === "scouting_hub") return 6;
  if (kind === "scout") return 11;
  if (kind === "agent" || kind === "manager") return 15;
  return 18;
}

/** Faixa efetiva [mín, máx]; `null` = sem acesso (núcleo sem autorização). */
export function effectiveBand(kind: string, min: number | null, max: number | null): { min: number; max: number } | null {
  if (min !== null && max !== null) return { min: Math.max(min, ageFloor(kind)), max: Math.min(max, BAND_MAX) };
  if (kind === "scouting_hub") return null;
  return { min: Math.max(11, ageFloor(kind)), max: BAND_MAX };
}

/** O que o admin pode gravar (mesmas regras de admin_set_org_age_band). */
export function validBand(kind: string, min: number, max: number) {
  return Number.isInteger(min) && Number.isInteger(max) && min >= ageFloor(kind) && max <= BAND_MAX && min <= max;
}

export const purposes = ["general", "evaluation_invite", "scholarship_50", "scholarship_100", "school_presentation"] as const;
export type Purpose = (typeof purposes)[number];

/** Finalidades que cada tipo de organização pode enviar. */
export function purposesFor(kind: string): Purpose[] {
  if (kind === "school") return [...purposes];
  if (kind === "club" || kind === "scouting_hub") return ["general", "evaluation_invite"];
  return ["general"];
}
