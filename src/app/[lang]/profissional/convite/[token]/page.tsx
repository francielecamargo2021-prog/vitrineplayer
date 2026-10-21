import { notFound, redirect } from "next/navigation";
import { hasLocale, htmlLang } from "@/i18n/config";
import { getDictionary, getPanelDictionary, getPortalDictionary } from "@/i18n/get-dictionary";
import { privateMetadata } from "@/lib/seo";
import { asService } from "@/lib/db";
import { getAccount } from "@/lib/auth/session";
import { completeProJoin, proJoinSignUp } from "@/lib/auth/actions";
import { AuthLayout } from "@/components/panel/AuthLayout";
import { BackendNotice } from "@/components/panel/PanelShell";
import { JoinForm } from "@/components/portal/JoinForm";

export const metadata = privateMetadata;

/** Convite para a equipe de uma organização verificada (link de uso único, 7 dias). */
export default async function JoinPage({ params }: PageProps<"/[lang]/profissional/convite/[token]">) {
  const { lang, token } = await params;
  if (!hasLocale(lang)) notFound();
  const [dict, p, t, account] = await Promise.all([getDictionary(lang), getPanelDictionary(lang), getPortalDictionary(lang), getAccount()]);
  if (!account.backend) return <BackendNotice p={p} />;
  if (account.user && account.profile?.signup_complete) redirect(`/${lang}/painel`);
  if (account.user && !account.user.emailVerified) redirect(`/${lang}/entrar/verificar`);
  const clean = /^[0-9a-f]{64}$/.test(token) ? token : "";
  const [info] = clean ? await asService<{ j: { name: string; kind: string; country: string } | null }>((q) => q`select org_invite_info(${clean}) as j`) : [null];
  const org = info?.j ?? null;
  return (
    <AuthLayout lang={lang} langLabel={dict.nav.langLabel} title={t.join.title} lead={t.join.lead}>
      {!org ? (
        <p className="border-l-2 border-[#e5a3a3] pl-4 text-[#f0c4c4]" data-testid="convite-invalido">{t.join.invalid}</p>
      ) : (
        <div className="space-y-8">
          <p className="text-fog" data-testid="convite-org">{t.join.org}: <span className="text-bone">{org.name}</span> · {(t.signup.kinds as Record<string, string>)[org.kind] ?? org.kind}</p>
          <JoinForm action={(account.user ? completeProJoin : proJoinSignUp).bind(null, lang, clean)} t={t} a={p.auth} locale={htmlLang[lang]} select={p.form.select} withAccount={!account.user} />
        </div>
      )}
    </AuthLayout>
  );
}
