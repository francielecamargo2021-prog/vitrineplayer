import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary, getPanelDictionary } from "@/i18n/get-dictionary";
import { privateMetadata } from "@/lib/seo";
import { signOut } from "@/lib/auth/actions";
import { AuthLayout } from "@/components/panel/AuthLayout";
import { ghostButton } from "@/components/panel/controls";

export const metadata = privateMetadata;

/** Aviso para conta suspensa pelo admin (o banco recusa qualquer acesso dela). */
export default async function SuspendedPage({ params }: PageProps<"/[lang]/entrar/suspensa">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [dict, p] = await Promise.all([getDictionary(lang), getPanelDictionary(lang)]);
  return (
    <AuthLayout lang={lang} langLabel={dict.nav.langLabel} title={p.suspended.title} lead={p.suspended.body}>
      <form action={signOut.bind(null, lang)} data-testid="conta-suspensa"><button className={ghostButton}>{p.shell.logout}</button></form>
    </AuthLayout>
  );
}
