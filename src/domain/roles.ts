/**
 * Papéis e permissões da aplicação. É a camada de conveniência da UI/servidor;
 * a garantia real fica nas políticas RLS do banco (supabase/migrations).
 */
export const roles = ["RESPONSIBLE", "PROFESSIONAL", "SCOUT", "ADMIN"] as const;
export type Role = (typeof roles)[number];

export type Permission =
  | "athlete:create"
  | "athlete:read:own"
  | "athlete:update:own"
  | "base:search"
  | "athlete:read:approved"
  | "pro:favorites"
  | "pro:lists"
  | "pro:notes"
  | "pro:contact-request"
  | "scout:evaluate"
  | "admin:review-athletes"
  | "admin:review-professionals"
  | "admin:all";

const matrix: Record<Role, Permission[]> = {
  RESPONSIBLE: ["athlete:create", "athlete:read:own", "athlete:update:own"],
  PROFESSIONAL: ["base:search", "athlete:read:approved", "pro:favorites", "pro:lists", "pro:notes", "pro:contact-request"],
  SCOUT: ["base:search", "athlete:read:approved", "pro:favorites", "pro:lists", "pro:notes", "pro:contact-request", "scout:evaluate"],
  ADMIN: ["admin:all", "admin:review-athletes", "admin:review-professionals", "base:search", "athlete:read:approved"],
};

/**
 * Profissionais/scouts só recebem permissões de base após aprovação da conta
 * (`professional_accounts.status = 'approved'`).
 */
export function can(role: Role, permission: Permission, opts: { proApproved?: boolean } = {}) {
  if (role === "ADMIN") return true;
  const granted = matrix[role].includes(permission);
  if (!granted) return false;
  if ((role === "PROFESSIONAL" || role === "SCOUT") && !opts.proApproved) return false;
  return true;
}
