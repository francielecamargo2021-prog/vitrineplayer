import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getPanelDictionary } from "@/i18n/get-dictionary";
import { getOrganizationDetail, requireAdmin } from "@/lib/admin/data";
import { removeMember, reviewOrganization, revokeInvite } from "@/lib/admin/actions";
import { ReviewForm } from "@/components/admin/ReviewForm";
import { ActionForm } from "@/components/admin/ActionForm";
import { Facts, Section, auditLabel, fmtDate } from "@/components/admin/AdminUi";
import { orgOptionsFor as optionsFor } from "@/components/admin/orgOptions";

const interestLabel: Record<string, string> = { requested: "aguardando", accepted: "aceitos", declined: "recusados", expired: "expirados" };
const reportLabel: Record<string, string> = { open: "aberta", reviewing: "em análise", resolved: "resolvida", dismissed: "arquivada" };

export default async function AdminOrganization({ params }: PageProps<"/[lang]/admin/organizacoes/[id]">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireAdmin(lang);
  if (!session) return null;
  const [p, d] = await Promise.all([getPanelDictionary("pt"), getOrganizationDetail(session, id)]);
  const o = d.org;
  const region = new Intl.DisplayNames(["pt-BR"], { type: "region" });
  return (
    <main className="gutter mx-auto max-w-6xl space-y-10 py-10 md:py-12">
      <Link href={`/${lang}/admin/organizacoes?situacao=${o.status}`} className="text-[0.875rem] text-fog hover:text-bone">← Organizações</Link>
      <div className="grid gap-10 md:grid-cols-12">
        <div className="space-y-6 md:col-span-6">
          <h1 className="font-display text-[2.4rem] font-black uppercase leading-[0.9] [font-stretch:62%]">{o.name}</h1>
          <Facts rows={[
            ["Tipo", p.privacy.kinds[o.kind as keyof typeof p.privacy.kinds] ?? o.kind], ["Situação", o.status],
            ["Local", [o.city, o.state, region.of(o.country) ?? o.country].filter(Boolean).join(", ")],
            ["Documento", o.document], ["Licença/registro", o.license], ["Site", o.website],
            ["Responsável", [o.contact_name, o.contact_role].filter(Boolean).join(" · ")], ["Contato", [o.contact_email, o.contact_phone].filter(Boolean).join(" · ")],
            ["Cadastro", fmtDate(o.created_at)], ["Último motivo", o.review_note],
          ]} />
          {o.about && <p className="text-[0.9rem] leading-relaxed text-fog">{o.about}</p>}
          <ReviewForm compact action={reviewOrganization.bind(null, lang, o.id)} options={optionsFor[o.status]} noteLabel="Motivo (registrado na auditoria)" />
        </div>
        <div className="space-y-8 md:col-span-6">
          <Section title={`Equipe (${d.members.length}/5)`} testId="equipe-org">
            <ul className="space-y-3 text-[0.9rem]">
              {d.members.map((m) => (
                <li key={m.profile_id} className="flex flex-wrap items-center justify-between gap-3">
                  <span><Link href={`/${lang}/admin/contas/${m.profile_id}`} className="text-bone hover:text-grass">{m.full_name}</Link>
                    <span className="text-ash"> · {m.email}{m.is_owner ? " · dono" : ""}{m.suspended_at ? " · conta suspensa" : ""}</span></span>
                  {!m.is_owner && <ActionForm action={removeMember.bind(null, lang, o.id, m.profile_id)} buttons={[{ label: "Remover", tone: "danger" }]} />}
                </li>
              ))}
            </ul>
            {d.invites.filter((i) => !i.used_at && !i.revoked_at && new Date(i.expires_at) > new Date()).map((i) => (
              <div key={i.id} className="mt-3 flex items-center justify-between gap-3 text-[0.85rem] text-fog">
                <span>Convite pendente · expira {fmtDate(i.expires_at)}</span>
                <ActionForm action={revokeInvite.bind(null, lang, i.id)} buttons={[{ label: "Cancelar convite" }]} />
              </div>
            ))}
          </Section>
          <Section title="Uso do portal">
            <Facts rows={[
              ["Fichas (30 dias)", d.usage.views_30d], ["Listas", d.usage.lists], ["Notas", d.usage.notes], ["Avaliações", d.usage.evaluations],
              ["Acompanhamento", d.usage.tracking],
              ["Interesses", Object.entries(d.usage.interests).map(([k, v]) => `${v} ${interestLabel[k] ?? k}`).join(" · ") || "nenhum"],
            ]} />
            <p className="mt-2 text-[0.8rem] text-ash">O conteúdo das notas, avaliações e listas é da organização; o admin vê só os números.</p>
          </Section>
          <Section title="Denúncias" testId="denuncias-org">
            {d.reports.length === 0 ? <p className="text-[0.9rem] text-fog">Nenhuma denúncia.</p> : (
              <ul className="space-y-2 text-[0.85rem] text-fog">
                {d.reports.map((r) => <li key={r.id}>{fmtDate(r.reported_at)} · {reportLabel[r.report_status]} · “{r.reason}” — <Link href={`/${lang}/admin/denuncias?situacao=${r.report_status}`} className="underline">tratar</Link></li>)}
              </ul>
            )}
          </Section>
          <Section title="Histórico">
            <ul className="space-y-1 text-[0.85rem] text-fog">
              {d.history.map((h, i) => {
                const note = (h.meta as { note?: string | null } | null)?.note;
                return <li key={i}>{fmtDate(h.created_at)} · {auditLabel[h.action] ?? h.action}{h.actor ? ` · ${h.actor}` : ""}{note ? ` — ${note}` : ""}</li>;
              })}
            </ul>
          </Section>
        </div>
      </div>
    </main>
  );
}
