import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { interestsOverview, requireAdmin } from "@/lib/admin/data";
import { cancelInterest } from "@/lib/admin/actions";
import { ActionForm } from "@/components/admin/ActionForm";
import { AdminTitle, Pills, fmtDate } from "@/components/admin/AdminUi";

const statuses = [["requested", "Aguardando a família"], ["accepted", "Aceitos"], ["declined", "Recusados"], ["expired", "Expirados"]] as const;

export default async function AdminInterests({ params, searchParams }: PageProps<"/[lang]/admin/interesses">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireAdmin(lang);
  if (!session) return null;
  const sp = await searchParams;
  const status = statuses.find(([k]) => k === sp.situacao)?.[0];
  const d = await interestsOverview(session, status);
  const base = `/${lang}/admin/interesses`;
  return (
    <main className="gutter mx-auto max-w-6xl space-y-8 py-12 md:py-16">
      <AdminTitle lead="Interesses enviados por organizações às famílias. A família decide; o admin só intervém em abuso.">Interesses</AdminTitle>
      <ul className="grid gap-px border-y border-white/12 bg-white/12 sm:grid-cols-5" data-testid="totais-interesses">
        <li className="bg-ink p-4"><span className="block font-display text-[2.6rem] font-black leading-none [font-stretch:62%]">{d.month}</span><span className="text-[0.85rem] text-fog">neste mês</span></li>
        {statuses.map(([k, l]) => <li key={k} className="bg-ink p-4"><span className="block font-display text-[2.6rem] font-black leading-none [font-stretch:62%]">{d.totals[k] ?? 0}</span><span className="text-[0.85rem] text-fog">{l.toLowerCase()}</span></li>)}
      </ul>
      <Pills label="Situação" items={[{ href: base, label: "Todos", current: !status }, ...statuses.map(([k, l]) => ({ href: `${base}?situacao=${k}`, label: l, current: k === status }))]} />
      {d.rows.length === 0 ? <p className="text-fog">Nenhum interesse.</p> : (
        <ul className="border-t border-white/12">
          {d.rows.map((r) => (
            <li key={r.id} className="grid gap-4 border-b border-white/12 py-5 md:grid-cols-12">
              <div className="space-y-1 md:col-span-7">
                <p className="text-[0.8rem] text-ash">{fmtDate(r.created_at)} · {statuses.find(([k]) => k === r.status)?.[1] ?? r.status}{r.reported ? " · denunciado" : ""}</p>
                <p><Link href={`/${lang}/admin/organizacoes/${r.organization_id}`} className="text-bone hover:text-grass">{r.org_name}</Link>
                  <span className="text-ash"> → </span><Link href={`/${lang}/admin/atletas/${r.athlete_id}`} className="text-bone hover:text-grass">{r.athlete}</Link></p>
                <p className="text-[0.9rem] text-fog">{r.message}</p>
              </div>
              <div className="md:col-span-5">
                {r.status === "requested" && <ActionForm action={cancelInterest.bind(null, lang, r.id)} note="Motivo do cancelamento (abuso)" noteRequired buttons={[{ label: "Cancelar interesse", tone: "danger" }]} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
