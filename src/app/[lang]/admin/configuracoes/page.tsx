import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { portalSettings, requireAdmin } from "@/lib/admin/data";
import { updatePortalSettings } from "@/lib/admin/actions";
import { PortalSettingsForm } from "@/components/admin/PortalSettingsForm";
import { AdminTitle, Facts, Section, fmtDate } from "@/components/admin/AdminUi";

export default async function AdminSettings({ params }: PageProps<"/[lang]/admin/configuracoes">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireAdmin(lang);
  if (!session) return null;
  const settings = await portalSettings(session);
  return (
    <main className="gutter mx-auto max-w-6xl space-y-10 py-12 md:py-16">
      <AdminTitle>Configurações</AdminTitle>
      <Section title="Limites do portal profissional" testId="limites-portal">
        <p className="max-w-[62ch] text-[0.9rem] text-ash">Protegem as famílias contra coleta em massa. Valem para todas as organizações; acesso básico gratuito. Última alteração: {fmtDate(settings.updated_at)}.</p>
        <PortalSettingsForm action={updatePortalSettings.bind(null, lang)} settings={settings} />
      </Section>
      <Section title="Análise por IA">
        <p className="text-[0.9rem] text-fog">Orçamento, limites e fila ficam no <Link href={`/${lang}/admin/ia`} className="text-bone underline">console da IA</Link>.</p>
      </Section>
      <Section title="Regras fixas (alteradas só no código, com testes)">
        <Facts rows={[
          ["Termos e consentimentos", "versão 2026-10"], ["Fotos por atleta", "12"], ["Vídeos por atleta", "20"], ["Equipe por organização", "até 5 pessoas"],
          ["Convite de equipe", "uso único, 7 dias"], ["Segundo fator do admin", "sessão de 8 h · 5 erros = 15 min de espera"],
        ]} />
      </Section>
    </main>
  );
}
