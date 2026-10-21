import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { outbox, requireAdmin } from "@/lib/admin/data";
import { AdminTitle, fmtDate } from "@/components/admin/AdminUi";

const templateLabel: Record<string, string> = {
  profile_approved: "Perfil aprovado", profile_rejected: "Ajustes pedidos", profile_suspended: "Perfil suspenso",
  interest_received: "Interesse recebido", interest_accepted: "Interesse aceito", correction_requested: "Correção pedida",
  media_removed: "Mídia removida", organization_approved: "Organização aprovada", organization_rejected: "Organização recusada",
  organization_suspended: "Organização suspensa", ai_report_ready: "Relatório de IA pronto",
};

/** Fila de avisos. Ficam guardados até a escolha do provedor de e-mail (nada é enviado ainda). */
export default async function AdminOutbox({ params }: PageProps<"/[lang]/admin/avisos">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireAdmin(lang);
  if (!session) return null;
  const rows = await outbox(session);
  return (
    <main className="gutter mx-auto max-w-6xl space-y-8 py-12 md:py-16">
      <AdminTitle lead="Avisos por e-mail ficam guardados aqui até a escolha do provedor de e-mail. Nenhum e-mail é enviado por enquanto; as famílias e organizações veem tudo no painel e no portal.">Avisos</AdminTitle>
      {rows.length === 0 ? <p className="text-fog">Nenhum aviso na fila.</p> : (
        <ul className="border-t border-white/12 text-[0.9rem]">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 border-b border-white/12 py-3 sm:flex-row sm:justify-between">
              <span className="text-bone">{templateLabel[r.template] ?? r.template} <span className="text-ash">→ {r.recipient}</span></span>
              <span className="text-[0.8rem] text-ash">{r.channel} · {r.status} · {fmtDate(r.scheduled_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
