import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getPanelDictionary } from "@/i18n/get-dictionary";
import { listOrganizationsByStatus, orgStatuses, portalSettings, reportsByOrganization, requireAdmin, type OrgStatus } from "@/lib/admin/data";
import { reviewOrganization, updatePortalSettings } from "@/lib/admin/actions";
import { PortalSettingsForm } from "@/components/admin/PortalSettingsForm";
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
  const [p, rows, reports, settings] = await Promise.all([
    getPanelDictionary("pt"), listOrganizationsByStatus(session.db, status), reportsByOrganization(session.db), portalSettings(session.db),
  ]);
  const region = new Intl.DisplayNames(["pt-BR"], { type: "region" });

  return (
    <main className="gutter mx-auto max-w-6xl py-12 md:py-16">
      <h1 className="font-display text-[clamp(2.6rem,10vw,5.5rem)] font-black uppercase leading-[0.85] [font-stretch:62%]">Organizações</h1>
      <p className="mt-4 max-w-[62ch] text-[0.9rem] leading-relaxed text-ash">
        Só organizações aprovadas veem atletas. Confira o documento (CNPJ, CPF do autônomo), a licença de agente ou o registro na federação e o site oficial antes de aprovar. Em caso de dúvida, fale com o contato informado antes de decidir.
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
                  {p.privacy.kinds[o.kind]} · {[o.city, o.state, region.of(o.country) ?? o.country].filter(Boolean).join(", ")}
                </p>
                <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-[0.85rem]">
                  <dt className="text-ash">Documento</dt><dd className="text-fog">{o.document ?? "não informado"}</dd>
                  <dt className="text-ash">Licença/registro</dt><dd className="text-fog">{o.license ?? "—"}</dd>
                  <dt className="text-ash">Responsável</dt><dd className="text-fog">{[o.contact_name, o.contact_role].filter(Boolean).join(" · ") || "—"}</dd>
                  <dt className="text-ash">Contato</dt><dd className="break-all text-fog">{[o.contact_email, o.contact_phone].filter(Boolean).join(" · ") || "—"}</dd>
                  <dt className="text-ash">Site</dt><dd className="break-all text-fog">{o.website ?? "—"}</dd>
                </dl>
                {o.about && <p className="mt-3 text-[0.85rem] leading-relaxed text-fog">{o.about}</p>}
                {o.review_note && <p className="mt-3 border-l-2 border-white/20 pl-3 text-[0.85rem] text-ash">Último motivo: {o.review_note}</p>}
                {reports.get(o.id)?.length ? (
                  <div className="mt-3 border-l-2 border-[#e5a3a3] pl-3 text-[0.85rem]" data-testid="org-reports">
                    <p className="text-[#f0c4c4]">{reports.get(o.id)!.length} denúncia(s) de famílias</p>
                    <ul className="mt-1 space-y-1 text-fog">
                      {reports.get(o.id)!.slice(0, 5).map((r, i) => <li key={i}>“{r.reason}”</li>)}
                    </ul>
                  </div>
                ) : null}
              </div>
              <div className="md:col-span-7">
                <ReviewForm compact action={reviewOrganization.bind(null, lang, o.id)} options={optionsFor[o.status]} noteLabel="Motivo (registrado na auditoria)" />
              </div>
            </li>
          ))}
        </ul>
      )}
      <section className="mt-16 border-t border-white/12 pt-10" aria-labelledby="limites">
        <h2 id="limites" className="font-display text-[clamp(2rem,6vw,3rem)] font-black uppercase leading-[0.85] [font-stretch:62%]">Limites do portal</h2>
        <p className="mt-3 max-w-[62ch] text-[0.9rem] leading-relaxed text-ash">
          Protegem as famílias contra coleta em massa. Valem para todas as organizações; acesso básico gratuito.
        </p>
        {settings && <PortalSettingsForm action={updatePortalSettings.bind(null, lang)} settings={settings} />}
      </section>
    </main>
  );
}
