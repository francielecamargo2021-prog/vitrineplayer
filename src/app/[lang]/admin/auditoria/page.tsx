import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { auditLog, requireAdmin } from "@/lib/admin/data";
import { AdminTitle, auditLabel, fmtDate } from "@/components/admin/AdminUi";

export default async function AdminAudit({ params, searchParams }: PageProps<"/[lang]/admin/auditoria">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireAdmin(lang);
  if (!session) return null;
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 80) : undefined);
  const action = one("acao") && /^[a-z_.]+$/.test(one("acao")!) ? one("acao") : undefined;
  const rows = await auditLog(session, { action, entity: one("id"), q: one("q") });
  const field = "h-11 border border-white/15 bg-ink px-3 text-[0.9rem] text-bone";
  return (
    <main className="gutter mx-auto max-w-6xl space-y-8 py-12 md:py-16">
      <AdminTitle lead="Registro de todas as decisões e ações sensíveis. Não pode ser alterado pela aplicação.">Auditoria</AdminTitle>
      <form method="get" className="flex flex-wrap gap-3" aria-label="Filtros">
        <select name="acao" defaultValue={action ?? ""} aria-label="Ação" className={field}>
          <option value="">Todas as ações</option>
          {[["athlete", "Atletas"], ["organization", "Organizações"], ["interest", "Interesses"], ["report", "Denúncias"], ["account", "Contas"], ["media", "Moderação"], ["ai", "IA"], ["admin.mfa", "Segundo fator"], ["portal", "Configurações"]]
            .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input name="q" defaultValue={one("q")} placeholder="Pessoa ou texto" aria-label="Texto" className={`${field} min-w-[14rem]`} />
        <input name="id" defaultValue={one("id")} placeholder="ID do registro" aria-label="ID" className={`${field} min-w-[18rem]`} />
        <button className="h-11 border border-white/20 px-4 text-[0.9rem] text-bone hover:border-bone">Filtrar</button>
      </form>
      <ul className="border-t border-white/12 text-[0.88rem]" data-testid="auditoria">
        {rows.map((r, i) => {
          const m = r.meta as { note?: string; reason?: string } | null;
          return (
            <li key={i} className="flex flex-col gap-1 border-b border-white/12 py-3 sm:flex-row sm:justify-between">
              <span className="text-bone">{auditLabel[r.action] ?? r.action}{m?.note || m?.reason ? <span className="text-fog"> — {m.note ?? m.reason}</span> : null}</span>
              <span className="text-[0.8rem] text-ash">{r.actor ?? "sistema/anônimo"} · {fmtDate(r.created_at)}</span>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
