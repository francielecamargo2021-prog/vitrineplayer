/**
 * Modelo de domínio do atleta — espelha supabase/migrations/0001_init.sql.
 * Dados de contato NUNCA fazem parte do atleta: pertencem ao responsável
 * (tabela `profiles`) e não são expostos a profissionais.
 */
export type AthleteStatus = "draft" | "pending_payment" | "in_review" | "approved" | "rejected" | "suspended";
export type DominantFoot = "right" | "left" | "both";
export type Seeking = "club" | "representation" | "agent" | "sponsorship" | "evaluation" | "other";
export type Position =
  | "GK" | "CB" | "RB" | "LB" | "DM" | "CM" | "AM" | "RW" | "LW" | "CF" | "ST";

export interface ClubSpell {
  club: string;
  category?: string;
  from: string; // AAAA-MM
  to?: string; // AAAA-MM; vazio = atual
}

export interface AthleteMedia {
  kind: "photo" | "youtube" | "video_link";
  url: string;
  title?: string;
  isPrimary?: boolean;
}

export interface Athlete {
  id: string;
  responsibleId: string;
  status: AthleteStatus;
  fullName: string;
  sportName: string;
  birthDate: string; // ISO
  country: string; // ISO-3166 alpha-2
  state: string;
  city: string;
  nationality: string[];
  primaryPosition: Position;
  secondaryPosition?: Position;
  foot: DominantFoot;
  heightCm?: number;
  weightKg?: number;
  currentClub?: string;
  category?: string;
  federated: boolean;
  clubs: ClubSpell[];
  competitions: string[];
  achievements: string[];
  traits: string[];
  goals: string;
  seeking: Seeking[];
  media: AthleteMedia[];
}

export const birthYear = (a: Pick<Athlete, "birthDate">) => Number(a.birthDate.slice(0, 4));
