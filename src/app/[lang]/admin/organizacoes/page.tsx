import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getPanelDictionary } from "@/i18n/get-dictionary";
import { listOrganizationsByStatus, orgStatuses, requireAdmin, type OrgStatus } from "@/lib/admin/data";
import { reviewOrganization } from "@/lib/admin/actions";
import { ReviewForm, type DecisionOption } from "@/components/admin/ReviewForm";

const statusLabel: Record<OrgStatus, string> = { pending: "Aguardando verificação", approved: "Aprovadas", rejected: "Recusadas", suspended: "Suspensas" };
const optionsFor: Record<OrgStatus, DecisionOption[]> = {
  pending: [
    { value: "approve", label: "Aprovar", needsNote: false, tone: "primary" },
    { value: "reject", label: "Recusar", needsNote: true, tone: "danger" },
  ],
  approved: [{ value: "suspend", label: "Suspender", needsNote: true, tone: "danger" }],
  rejected: [{ value: "approve", label: "Aprovar", needsNote: false, tone: "primary" }],
  suspended: [{ value: "approve", label: "Reativar", needsNote: false, tone: "primary" }],
};

export default async function AdminOrganizations({ params, searchParams }: PageProps<"/[lang]/admin/organizacoes">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireAdmin(lang);
  if (!session) return null;
  const sp = await searchParams;
  const status = (orgStatuses as string[]).includes(String(sp.situacao)) ? (sp.situacao as OrgStatus) : "pending";
  const [p, rows] = await Promise.all([getPanelDictionary("pt"), listOrganizationsByStatus(session.db, status)]);
  const region = new Intl.DisplayNames(["pt-BR"], { type: "region" });

  return (
    <main className="gutter mx-auto max-w-6xl py-12 md:py-16">
      <h1 className="font-display text-[clamp(2.6rem,10vw,5.5rem)] font-black uppercase leading-[0.85] [font-stretch:62%]">Organizações</h1>
      <p className="mt-4 max-w-[62ch] text-[0.9rem] leading-relaxed text-ash">
        Só organizações aprovadas veem atletas. Confira documento (CNPJ, registro na federação, licença de agente) antes de aprovar.
      </p>
      <nav aria-label="Situação" className="mt-8 flex flex-wrap gap-2">
        {orgStatuses.map((s) => (
          <Link key={s} href={`/${lang}/admin/organizacoes?situacao=${s}`} aria-current={s === status ? "page" : undefined}
            className={`inline-flex min-h-11 items-center border px-4 text-[0.9rem] transition-colors ${s === status ? "border-grass bg-grass/15 text-bone" : "border-white/15 text-fog hover:border-white/40"}`}>
            {statusLabel[s]}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="mt-10 text-fog">Nenhuma organização nesta situação.</p>
      ) : (
        <ul className="mt-8 border-t border-white/12">
          {rows.map((o) => (
            <li key={o.id} className="grid gap-4 border-b border-white/12 py-5 md:grid-cols-12">
              <div className="md:col-span-5">
                <p className="text-bone">{o.name}</p>
                <p className="mt-1 text-[0.85rem] text-ash">
                  {p.privacy.kinds[o.kind]} · {region.of(o.country) ?? o.country}
                  {o.document ? ` · doc. ${o.document}` : " · sem documento informado"}
                </p>
                {o.website && <p className="mt-1 break-all text-[0.85rem] text-ash">{o.website}</p>}
              </div>
              <div className="md:col-span-7">
                <ReviewForm compact action={reviewOrganization.bind(null, lang, o.id)} options={optionsFor[o.status]} noteLabel="Motivo (registrado na auditoria)" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
