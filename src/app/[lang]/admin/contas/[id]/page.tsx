import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getAccountDetail, requireAdmin } from "@/lib/admin/data";
import { getPanelDictionary } from "@/i18n/get-dictionary";
import { deleteAccountByAdmin, setAccountSuspended } from "@/lib/admin/actions";
import { ActionForm } from "@/components/admin/ActionForm";
import { Facts, Section, auditLabel, fmtDate } from "@/components/admin/AdminUi";

const roleLabel: Record<string, string> = { RESPONSIBLE: "Responsável", PROFESSIONAL: "Profissional", SCOUT: "Profissional (olheiro)", ADMIN: "Administrador" };

export default async function AdminAccount({ params }: PageProps<"/[lang]/admin/contas/[id]">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireAdmin(lang);
  if (!session) return null;
  const [d, pd] = await Promise.all([getAccountDetail(session, id), getPanelDictionary("pt")]);
  const p = d.profile;
  const isAdmin = p.role === "ADMIN";
  return (
    <main className="gutter mx-auto max-w-6xl space-y-10 py-10 md:py-12">
      <Link href={`/${lang}/admin/contas?papel=${p.role === "SCOUT" ? "PROFESSIONAL" : p.role}`} className="text-[0.875rem] text-fog hover:text-bone">← Contas</Link>
      <div className="grid gap-10 md:grid-cols-12">
        <div className="space-y-6 md:col-span-6">
          <h1 className="font-display text-[2.4rem] font-black uppercase leading-[0.9] [font-stretch:62%]">{p.full_name}</h1>
          <Facts rows={[
            ["Tipo", roleLabel[p.role] ?? p.role], ["E-mail", p.email], ["WhatsApp", p.whatsapp], ["País", p.country], ["Idioma", p.locale],
            ["Desde", fmtDate(p.created_at)], ["Situação", p.suspended_at ? `Suspensa em ${fmtDate(p.suspended_at)} — ${p.suspension_note ?? ""}` : "Ativa"],
          ]} />
          {d.athletes.length > 0 && (
            <Section title="Atletas vinculados">
              <ul className="space-y-1.5 text-[0.9rem]">
                {d.athletes.map((a) => (
                  <li key={a.id}><Link href={`/${lang}/admin/atletas/${a.id}`} className="text-bone hover:text-grass">{a.name}</Link>
                    <span className="text-ash"> · {pd.status[a.status as keyof typeof pd.status] ?? a.status} · {pd.newAthlete.relations[a.relation as keyof typeof pd.newAthlete.relations] ?? a.relation}{a.other_guardians ? ` · +${a.other_guardians} responsável(is)` : " · responsável único"}</span></li>
                ))}
              </ul>
            </Section>
          )}
          {d.organizations.length > 0 && (
            <Section title="Organizações">
              <ul className="space-y-1.5 text-[0.9rem]">
                {d.organizations.map((o) => (
                  <li key={o.id}><Link href={`/${lang}/admin/organizacoes/${o.id}`} className="text-bone hover:text-grass">{o.name}</Link>
                    <span className="text-ash"> · {o.status}{o.is_owner ? " · dono" : " · membro"}</span></li>
                ))}
              </ul>
            </Section>
          )}
          <Section title="Consentimentos">
            <ul className="space-y-1 text-[0.85rem] text-fog">
              {d.consents.map((c, i) => <li key={i}>{c.kind} · versão {c.version} · {fmtDate(c.granted_at)}{c.revoked_at ? ` · revogado ${fmtDate(c.revoked_at)}` : ""}</li>)}
            </ul>
          </Section>
        </div>
        <div className="space-y-8 md:col-span-6">
          {!isAdmin && (
            <Section title={p.suspended_at ? "Reativar conta" : "Suspender conta"} testId="suspender-conta">
              <p className="mb-3 text-[0.85rem] text-ash">Conta suspensa não entra no painel nem no portal e o banco recusa qualquer acesso dela.</p>
              {p.suspended_at
                ? <ActionForm action={setAccountSuspended.bind(null, lang, p.id, false)} buttons={[{ label: "Reativar", tone: "primary" }]} />
                : <ActionForm action={setAccountSuspended.bind(null, lang, p.id, true)} note="Motivo (registrado na auditoria)" noteRequired buttons={[{ label: "Suspender", tone: "danger" }]} />}
            </Section>
          )}
          <Section title="Dados pessoais (LGPD)" testId="lgpd-admin">
            {/* download de arquivo gerado pela API (não é navegação entre páginas) */}
            <a download href={`/api/admin/exportar/${p.id}`} className="inline-flex min-h-11 items-center border border-white/20 px-4 text-[0.9rem] text-bone hover:border-bone">Exportar dados (JSON)</a>
            {!isAdmin && (
              <div className="mt-6 border-l-2 border-[#e5a3a3]/60 pl-4">
                <p className="mb-3 text-[0.85rem] text-fog">Excluir a conta a pedido do titular apaga o login, o perfil e os atletas dos quais ele é o único responsável (com fotos e vídeos). Registros de terceiros ficam sem identificação. Não pode ser desfeito.</p>
                <ActionForm action={deleteAccountByAdmin.bind(null, lang, p.id)} note="Como o pedido chegou (canal e data)" noteRequired confirmWord="EXCLUIR"
                  buttons={[{ label: "Excluir conta", tone: "danger" }]} testId="excluir-conta-admin" />
              </div>
            )}
          </Section>
          <Section title="Atividade">
            <ul className="space-y-1 text-[0.85rem] text-fog">
              {d.activity.length === 0 && <li>Sem registros.</li>}
              {d.activity.map((h, i) => <li key={i}>{fmtDate(h.created_at)} · {auditLabel[h.action] ?? h.action}</li>)}
            </ul>
          </Section>
        </div>
      </div>
    </main>
  );
}
