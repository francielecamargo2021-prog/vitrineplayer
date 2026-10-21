import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { listReports, reportStatuses, requireAdmin, type ReportStatus } from "@/lib/admin/data";
import { resolveReport } from "@/lib/admin/actions";
import { ActionForm } from "@/components/admin/ActionForm";
import { AdminTitle, Pills, fmtDate } from "@/components/admin/AdminUi";

const label: Record<ReportStatus, string> = { open: "Abertas", reviewing: "Em análise", resolved: "Resolvidas", dismissed: "Arquivadas" };

export default async function AdminReports({ params, searchParams }: PageProps<"/[lang]/admin/denuncias">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireAdmin(lang);
  if (!session) return null;
  const sp = await searchParams;
  const status = (reportStatuses as readonly string[]).includes(String(sp.situacao)) ? (sp.situacao as ReportStatus) : "open";
  const rows = await listReports(session, { status });
  const base = `/${lang}/admin/denuncias`;
  const open = status === "open" || status === "reviewing";
  return (
    <main className="gutter mx-auto max-w-6xl space-y-8 py-12 md:py-16">
      <AdminTitle lead="Denúncias feitas pelas famílias sobre interesses recebidos. A organização nunca fica sabendo da denúncia; a decisão fica registrada.">Denúncias</AdminTitle>
      <Pills label="Situação" items={reportStatuses.map((s) => ({ href: `${base}?situacao=${s}`, label: label[s], current: s === status }))} />
      {rows.length === 0 ? <p className="text-fog">Nenhuma denúncia nesta situação.</p> : (
        <ul className="border-t border-white/12" data-testid="fila-denuncias">
          {rows.map((r) => (
            <li key={r.id} className="grid gap-6 border-b border-white/12 py-6 md:grid-cols-12">
              <div className="space-y-2 md:col-span-6">
                <p className="text-[0.8rem] text-ash">{fmtDate(r.reported_at)} · {label[r.report_status]}</p>
                <p><Link href={`/${lang}/admin/organizacoes/${r.organization_id}`} className="text-bone hover:text-grass">{r.org_name}</Link>
                  <span className="text-[0.85rem] text-ash"> ({r.org_status}) → atleta <Link href={`/${lang}/admin/atletas/${r.athlete_id}`} className="underline">{r.athlete}</Link></span></p>
                <p className="text-[0.9rem] text-[#f0c4c4]">Motivo da família: “{r.reason}”</p>
                <blockquote className="border-l-2 border-white/20 pl-3 text-[0.9rem] text-fog">{r.message}</blockquote>
                {r.resolution && <p className="text-[0.85rem] text-ash">Decisão: {r.resolution}{r.resolved_by ? ` · ${r.resolved_by}` : ""}{r.resolved_at ? ` · ${fmtDate(r.resolved_at)}` : ""}</p>}
              </div>
              <div className="md:col-span-6">
                {open && (
                  <ActionForm action={resolveReport.bind(null, lang, r.id)} note="Registro da decisão (obrigatório para resolver ou arquivar)"
                    checkbox={r.org_status === "approved" ? { name: "suspend_org", label: "Suspender a organização nesta decisão" } : undefined}
                    buttons={[...(r.report_status === "open" ? [{ value: "reviewing", label: "Em análise" }] : []),
                      { value: "resolved", label: "Resolver", tone: "primary" as const }, { value: "dismissed", label: "Arquivar" }]} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
