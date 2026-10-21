import qrcode from "qrcode-generator";
import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { privateMetadata } from "@/lib/seo";
import { getAccount } from "@/lib/auth/session";
import { mfaReady, mfaState, mfaVerified, pendingSecret } from "@/lib/auth/mfa";
import { startEnroll, submitCode, submitRecovery } from "@/lib/auth/mfa-actions";
import { AuthLayout } from "@/components/panel/AuthLayout";
import { CodeForm, RecoveryForm } from "@/components/admin/MfaForms";
import { primaryButton } from "@/components/panel/controls";

export const metadata = privateMetadata;

/**
 * Segundo fator do administrador: configurar o aplicativo autenticador (QR code) ou
 * digitar o código de 6 dígitos. Sem isso, o banco não reconhece a conta como admin.
 */
export default async function SecondFactorPage({ params, searchParams }: PageProps<"/[lang]/entrar/segundo-fator">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [dict, a] = await Promise.all([getDictionary(lang), getAccount()]);
  if (!a.backend || !a.user) redirect(`/${lang}/entrar`);
  if (!a.user.emailVerified) redirect(`/${lang}/entrar/verificar`);
  if (a.profile?.role !== "ADMIN") redirect(`/${lang}/painel`);
  const adminHref = `/${lang}/admin`;
  const title = ["Segundo", "fator"];

  if (!mfaReady()) {
    return (
      <AuthLayout lang={lang} langLabel={dict.nav.langLabel} title={title} lead="A área administrativa exige o segundo fator.">
        <p className="border-l-2 border-[#e5a3a3] pl-4 text-[#f0c4c4]" data-testid="mfa-sem-chave">
          O servidor ainda não tem a chave do segundo fator (ADMIN_MFA_KEY). A área administrativa fica fechada até ela ser configurada.
        </p>
      </AuthLayout>
    );
  }
  const sp = await searchParams;
  const [state, verified] = await Promise.all([mfaState(a.user.id), mfaVerified(a.user.id)]);
  if (verified && sp.trocar !== "1" && !state.pending) redirect(adminHref);
  const pending = state.pending ? await pendingSecret(a.user.id, a.user.email) : null;

  if (pending) {
    const qr = qrcode(0, "M");
    qr.addData(pending.uri);
    qr.make();
    return (
      <AuthLayout lang={lang} langLabel={dict.nav.langLabel} title={["Configurar", "segundo fator"]}
        lead="Abra um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy ou 1Password), leia o QR code e digite o código de 6 dígitos.">
        <div className="space-y-8">
          <div className="w-fit bg-bone p-3" aria-label="QR code do segundo fator" dangerouslySetInnerHTML={{ __html: qr.createSvgTag({ cellSize: 5, margin: 2, scalable: false }) }} />
          <p className="text-[0.85rem] text-ash">Sem câmera? Digite a chave no aplicativo: <span className="break-all font-mono text-bone" data-testid="mfa-chave">{pending.secret}</span></p>
          <CodeForm action={submitCode.bind(null, lang)} lang={lang} />
        </div>
      </AuthLayout>
    );
  }
  if (!state.enrolled || sp.trocar === "1") {
    return (
      <AuthLayout lang={lang} langLabel={dict.nav.langLabel} title={["Configurar", "segundo fator"]}
        lead="Contas de administrador usam um segundo fator: além da senha, um código do aplicativo autenticador no celular.">
        <form action={startEnroll.bind(null, lang)}>
          <button className={`${primaryButton} w-full`}>Gerar QR code</button>
        </form>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout lang={lang} langLabel={dict.nav.langLabel} title={title} lead="Digite o código de 6 dígitos do aplicativo autenticador.">
      <div className="space-y-10">
        <CodeForm action={submitCode.bind(null, lang)} lang={lang} />
        <div className="border-t border-white/10 pt-6"><RecoveryForm action={submitRecovery.bind(null, lang)} adminHref={adminHref} /></div>
      </div>
    </AuthLayout>
  );
}
