import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary, getPortalDictionary } from "@/i18n/get-dictionary";
import { privateMetadata } from "@/lib/seo";
import { getAccount } from "@/lib/auth/session";
import { MockShell } from "@/components/home/MockShell";
import { ProPortalMock } from "@/components/mockups/ProPortalMock";
import { ghostButton, primaryButton } from "@/components/panel/controls";

export const metadata = privateMetadata;

/**
 * Entrada pública para profissionais: chamada para o cadastro + demonstração com
 * dados fictícios (o portal real fica em /portal, só para organizações verificadas).
 */
export default async function ProPortalPage({ params }: PageProps<"/[lang]/profissional">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [dict, t, account] = await Promise.all([getDictionary(lang), getPortalDictionary(lang), getAccount()]);
  const isPro = account.profile?.role === "PROFESSIONAL" || account.profile?.role === "SCOUT";
  return (
    <MockShell lang={lang} dict={dict}>
      <section className="gutter border-b border-white/[0.07] bg-pitch py-8 md:py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-[60ch]">
            <h1 className="font-display text-[clamp(2.2rem,8vw,3.6rem)] font-black uppercase leading-[0.86] [font-stretch:62%]">{t.cta.title}</h1>
            <p className="mt-3 leading-relaxed text-fog">{t.cta.body}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            {isPro ? (
              <Link href={`/${lang}/portal`} className={primaryButton}>{t.cta.portal}</Link>
            ) : (
              <>
                <Link href={`/${lang}/profissional/cadastro`} className={primaryButton}>{t.cta.signup}</Link>
                {!account.user && <Link href={`/${lang}/entrar`} className={ghostButton}>{t.cta.login}</Link>}
              </>
            )}
          </div>
        </div>
        <p className="mx-auto mt-6 max-w-6xl text-[0.8rem] text-ash">
          {t.cta.demo}{" "}
          <Link href={`/${lang}/profissional/scout-premium`} className="text-bone underline underline-offset-4 hover:text-grass">{lang === "es" ? "Scout Premium (vista previa)" : "Scout Premium (prévia)"}</Link>
        </p>
      </section>
      <ProPortalMock dict={dict} />
    </MockShell>
  );
}
