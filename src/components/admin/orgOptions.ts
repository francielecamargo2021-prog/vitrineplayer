import type { DecisionOption } from "./ReviewForm";
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
