import "server-only";
import { asUser } from "@/lib/db";

/**
 * Interesses recebidos pelos atletas do responsável. Lido COMO o responsável:
 * guardian_interests() só devolve pedidos dos atletas vinculados a ele, e o contato
 * oficial da organização só aparece depois que a família aceita.
 */
export type ReceivedInterest = {
  id: string; athlete_id: string; athlete_name: string; organization_id: string; org_name: string; org_kind: string;
  org_country: string; org_state: string | null; org_city: string | null; org_verified: boolean; org_about: string | null;
  message: string; status: "requested" | "accepted" | "declined" | "expired"; created_at: string; resolved_at: string | null;
  reported: boolean; blocked: boolean;
  /** finalidade (0015): geral, convite para avaliação, bolsa 50/100%, apresentação da escolinha */
  purpose: string;
  org_contact: { name: string | null; role: string | null; email: string | null; phone: string | null; website: string | null } | null;
};

export async function receivedInterests(userId: string) {
  return asUser<ReceivedInterest>(userId, (q) => q`select g.*, coalesce(p.purpose, 'general') as purpose
    from guardian_interests() g left join lateral interest_purposes(array[g.id]) p on true`);
}

/** Pedidos de correção (e avisos de mídia removida) ainda em aberto para o atleta. */
export async function openCorrections(userId: string, athleteId: string) {
  return asUser<{ id: string; note: string; created_at: string }>(userId, (q) =>
    q`select id, note, created_at::text from athlete_correction_requests where athlete_id = ${athleteId}::uuid and resolved_at is null order by created_at`);
}
