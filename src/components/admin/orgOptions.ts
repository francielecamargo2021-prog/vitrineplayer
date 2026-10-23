import type { DecisionOption } from "./ReviewForm";
import { effectiveBand } from "@/domain/organization-age";
import type { OrgStatus } from "@/lib/admin/data";

/** Decisões possíveis sobre uma organização, por situação. */
export const orgOptionsFor: Record<OrgStatus, DecisionOption[]> = {
  pending: [
    { value: "approve", label: "Aprovar", needsNote: false, tone: "primary" },
    { value: "reject", label: "Recusar", needsNote: true, tone: "danger" },
  ],
  approved: [{ value: "suspend", label: "Suspender", needsNote: true, tone: "danger" }],
  rejected: [{ value: "approve", label: "Aprovar", needsNote: false, tone: "primary" }],
  suspended: [{ value: "approve", label: "Reativar", needsNote: false, tone: "primary" }],
};

/** Texto da faixa de idade efetiva (mesma regra do banco, 0015). */
export function bandText(kind: string, min: number | null, max: number | null) {
  const b = effectiveBand(kind, min, max);
  if (!b) return "Nenhum acesso até o admin definir a faixa";
  return `${b.min} a ${b.max} anos${min === null ? " (padrão do tipo)" : " (autorizada pelo admin)"}`;
}
