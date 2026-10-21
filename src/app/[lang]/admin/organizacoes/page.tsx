import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getPanelDictionary } from "@/i18n/get-dictionary";
import { listOrganizations, orgKinds, orgStatuses, requireAdmin, type OrgStatus } from "@/lib/admin/data";
import { reviewOrganization } from "@/lib/admin/actions";
import { ReviewForm } from "@/components/admin/ReviewForm";
import { orgOptionsFor as optionsFor } from "@/components/admin/orgOptions";
import { AdminTitle, Pills, SearchBox } from "@/components/admin/AdminUi";

const statusLabel: Record<OrgStatus, string> = { pending: "Aguardando verificação", approved: "Aprovadas", rejected: "Recusadas", suspended: "Suspensas" };

export default async function AdminOrganizations({ params, searchParams }: PageProps<"/[lang]/admin/organizacoes">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireAdmin(lang);
  if (!session) return null;
  const sp = await searchParams;
  const status = (orgStatuses as string[]).includes(String(sp.situacao)) ? (sp.situacao as OrgStatus) : "pending";
  const kind = (orgKinds as readonly string[]).includes(String(sp.tipo)) ? String(sp.tipo) : undefined;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : undefined;
  const [p, rows] = await Promise.all([getPanelDictionary("pt"), listOrganizations(session, { status, kind, q })]);
  const region = new Intl.DisplayNames(["pt-BR"], { type: "region" });
  const base = `/${lang}/admin/organizacoes`;
  const href = (s: string, k?: string) => `${base}?situacao=${s}${k ? `&tipo=${k}` : ""}`;

  return (
    <main className="gutter mx-auto max-w-6xl space-y-6 py-12 md:py-16">
      <AdminTitle lead="Só organizações aprovadas veem atletas. Confira documento (CNPJ, CPF do autônomo), licença de agente ou registro na federação e o site oficial antes de aprovar.">Organizações</AdminTitle>
      <Pills label="Situação" items={orgStatuses.map((s) => ({ href: href(s, kind), label: statusLabel[s], current: s === status }))} />
      <Pills label="Tipo" items={[{ href: href(status), label: "Todos os tipos", current: !kind },
        ...orgKinds.map((k) => ({ href: href(status, k), label: p.privacy.kinds[k], current: k === kind }))]} />
      <SearchBox action={base} value={q} placeholder="Nome ou documento" hidden={{ situacao: status, ...(kind ? { tipo: kind } : {}) }} />
      {rows.length === 0 ? <p className="pt-4 text-fog">Nenhuma organização nesta situação.</p> : (
        <ul className="border-t border-white/12">
          {rows.map((o) => (
            <li key={o.id} className="grid gap-4 border-b border-white/12 py-5 md:grid-cols-12">
              <div className="md:col-span-5">
                <Link href={`${base}/${o.id}`} className="text-bone hover:text-grass">{o.name}</Link>
                <p className="mt-1 text-[0.85rem] text-ash">{p.privacy.kinds[o.kind as keyof typeof p.privacy.kinds] ?? o.kind} · {[o.city, o.state, region.of(o.country) ?? o.country].filter(Boolean).join(", ")}</p>
                <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-[0.85rem]">
                  <dt className="text-ash">Documento</dt><dd className="text-fog">{o.document ?? "não informado"}</dd>
                  <dt className="text-ash">Licença/registro</dt><dd className="text-fog">{o.license ?? "—"}</dd>
                  <dt className="text-ash">Responsável</dt><dd className="text-fog">{[o.contact_name, o.contact_role].filter(Boolean).join(" · ") || "—"}</dd>
                  <dt className="text-ash">Contato</dt><dd className="break-all text-fog">{[o.contact_email, o.contact_phone].filter(Boolean).join(" · ") || "—"}</dd>
                  <dt className="text-ash">Site</dt><dd className="break-all text-fog">{o.website ?? "—"}</dd>
                  <dt className="text-ash">Equipe</dt><dd className="text-fog">{o.members} pessoa(s)</dd>
                </dl>
                {o.about && <p className="mt-3 text-[0.85rem] leading-relaxed text-fog">{o.about}</p>}
                {o.review_note && <p className="mt-3 border-l-2 border-white/20 pl-3 text-[0.85rem] text-ash">Último motivo: {o.review_note}</p>}
                {o.reports > 0 && <p className="mt-3 text-[0.85rem] text-[#f0c4c4]" data-testid="org-reports">{o.reports} denúncia(s) de famílias — <Link href={`${base}/${o.id}`} className="underline">ver</Link></p>}
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
