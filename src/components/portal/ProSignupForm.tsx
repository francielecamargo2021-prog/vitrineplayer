"use client";

import Link from "next/link";
import { useKeepAction } from "@/components/forms/use-keep-action";
import type { PanelDictionary, PortalDictionary } from "@/i18n/get-dictionary";
import type { AuthFormState } from "@/lib/auth/actions";
import { countryOptions } from "@/domain/athlete";
import { SelectField, TextArea, TextField, primaryButton } from "@/components/panel/controls";

type Action = (prev: AuthFormState, fd: FormData) => Promise<AuthFormState>;

function Consent({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer gap-3 text-[0.9rem] leading-snug text-fog">
      <input type="checkbox" name={name} required className="mt-0.5 size-5 shrink-0 accent-[#4f9a6a]" />
      <span>{children}</span>
    </label>
  );
}

/**
 * Cadastro profissional. `withAccount` = conta nova (nome, e-mail, senha); sem ele,
 * só os dados da organização (conta já criada que ainda não concluiu o cadastro).
 * A organização entra como "pendente": só o admin libera o acesso aos atletas.
 */
export function ProSignupForm({ action, t, a, lang, locale, select, optional, withAccount }: {
  action: Action; t: PortalDictionary["signup"]; a: PanelDictionary["auth"]; lang: string; locale: string; select: string; optional: string; withAccount: boolean;
}) {
  const [state, formAction, pending] = useKeepAction(action);
  const countries = countryOptions(locale);
  const err = state?.error
    ? (t.errors as Record<string, string>)[state.error] ?? (a.errors as Record<string, string>)[state.error] ?? a.errors.generic
    : null;
  const kinds = Object.entries(t.kinds).map(([value, label]) => ({ value, label }));
  return (
    <form onSubmit={formAction} className="space-y-6">
      {withAccount && (
        <fieldset className="space-y-6">
          <legend className="eyebrow mb-4 text-bone">{t.account}</legend>
          <TextField label={t.fullName} name="full_name" autoComplete="name" required minLength={3} />
          <TextField label={a.email} name="email" type="email" autoComplete="email" required />
          <div className="grid gap-6 sm:grid-cols-2">
            <TextField label={a.password} name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} hint={a.passwordHint} />
            <TextField label={a.confirm} name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
          </div>
        </fieldset>
      )}
      <TextField label={t.whatsapp} name="whatsapp" type="tel" autoComplete="tel" inputMode="tel" placeholder="+00 00 00000-0000" required hint={t.whatsappHint} />
      <SelectField label={t.country} name="country" required placeholder={select} options={countries} />

      <fieldset className="space-y-6 border-t border-white/10 pt-8">
        <legend className="eyebrow mb-4 text-bone">{t.organization}</legend>
        <SelectField label={t.kind} name="kind" required placeholder={select} options={kinds} />
        <TextField label={t.orgName} name="org_name" required minLength={2} maxLength={120} />
        <TextField label={t.contactRole} name="contact_role" required minLength={2} maxLength={80} hint={t.contactRoleHint} />
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField label={t.document} name="document" required minLength={3} maxLength={40} hint={t.documentHint} />
          <TextField label={t.license} name="license" maxLength={80} optional={optional} hint={t.licenseHint} />
        </div>
        <SelectField label={t.orgCountry} name="org_country" required placeholder={select} options={countries} />
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField label={t.state} name="state" maxLength={80} />
          <TextField label={t.city} name="city" maxLength={80} />
        </div>
        <TextField label={t.website} name="website" type="url" maxLength={200} placeholder="https://" hint={t.websiteHint} />
        <TextArea label={t.about} name="about" maxLength={600} hint={t.aboutHint} />
      </fieldset>

      <div className="space-y-4 border-t border-white/10 pt-6">
        <Consent name="terms">{t.terms}</Consent>
        <Consent name="privacy">{t.privacy}</Consent>
        <Consent name="pro_conduct">{t.conduct}</Consent>
      </div>
      {err && <p role="alert" className="border-l-2 border-[#e5a3a3] pl-4 text-[#f0c4c4]">{err}</p>}
      <button disabled={pending} className={`${primaryButton} w-full`}>{withAccount ? t.create : t.complete}</button>
      {withAccount && (
        <div className="space-y-2 text-[0.9rem] text-ash">
          <p>{t.haveAccount} <Link href={`/${lang}/entrar`} className="text-bone underline-offset-4 hover:underline">{t.login}</Link></p>
          <p><Link href={`/${lang}/cadastro`} className="text-fog underline-offset-4 hover:underline">{t.guardianLink}</Link></p>
        </div>
      )}
    </form>
  );
}
