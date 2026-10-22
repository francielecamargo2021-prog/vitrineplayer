"use client";

import { useKeepAction } from "@/components/forms/use-keep-action";
import Link from "next/link";
import type { PanelDictionary } from "@/i18n/get-dictionary";
import type { AuthFormState } from "@/lib/auth/actions";
import { countryOptions } from "@/domain/athlete";
import { SelectField, TextField, primaryButton, textButton } from "./controls";

type Action = (prev: AuthFormState, fd: FormData) => Promise<AuthFormState>;
type A = PanelDictionary["auth"];
const link = "text-bone underline-offset-4 hover:underline";

function Consent({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer gap-3 text-[0.9rem] leading-snug text-fog">
      <input type="checkbox" name={name} required className="mt-0.5 size-5 shrink-0 accent-[#4f9a6a]" />
      <span>{children}</span>
    </label>
  );
}

/** Links para ler Termos e Privacidade (nova aba: o formulário não se perde). */
export function LegalLinks({ a, lang }: { a: A; lang: "pt" | "es" }) {
  const cls = "text-bone underline underline-offset-4 hover:text-grass";
  return (
    <p className="text-[0.85rem] text-ash">
      {a.legalRead}{" "}
      <Link href={`/${lang}/termos`} target="_blank" rel="noopener" className={cls}>{a.termsLink}</Link>
      {" · "}
      <Link href={`/${lang}/privacidade`} target="_blank" rel="noopener" className={cls}>{a.privacyLink}</Link>
    </p>
  );
}

function Feedback({ state, a }: { state: AuthFormState; a: A }) {
  const info = state?.message && (a as Record<string, unknown>)[state.message];
  if (typeof info === "string") return <p role="status" className="border-l-2 border-grass pl-4 text-bone">{info}</p>;
  if (!state?.error) return null;
  const msg = (a.errors as Record<string, string>)[state.error] ?? a.errors.generic;
  return <p role="alert" className="border-l-2 border-[#e5a3a3] pl-4 text-[#f0c4c4]">{msg}</p>;
}

/** WhatsApp, país e os 4 consentimentos: passo 2 do cadastro (no formulário inicial ou em "concluir"). */
function SignupDetails({ a, locale, select }: { a: A; locale: string; select: string }) {
  return (
    <>
      <TextField label={a.whatsapp} name="whatsapp" type="tel" autoComplete="tel" inputMode="tel" placeholder="+00 00 00000-0000" required hint={a.whatsappHint} />
      <SelectField label={a.country} name="country" required placeholder={select} options={countryOptions(locale)} hint={a.countryHint} />
      <div className="space-y-4 border-t border-white/10 pt-6">
        <Consent name="terms">{a.terms}</Consent>
        <Consent name="privacy">{a.privacy}</Consent>
        <Consent name="guardian_declaration">{a.guardian}</Consent>
        <Consent name="no_guarantee">{a.noGuarantee}</Consent>
        <LegalLinks a={a} lang={locale.startsWith("es") ? "es" : "pt"} />
      </div>
    </>
  );
}

export function SignupForm({ action, a, loginHref, locale, select }: { action: Action; a: A; loginHref: string; locale: string; select: string }) {
  const [state, formAction, pending] = useKeepAction(action);
  return (
    <form onSubmit={formAction} className="space-y-6">
      <TextField label={a.fullName} name="full_name" autoComplete="name" required minLength={3} />
      <TextField label={a.email} name="email" type="email" autoComplete="email" required />
      <div className="grid gap-6 sm:grid-cols-2">
        <TextField label={a.password} name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} hint={a.passwordHint} />
        <TextField label={a.confirm} name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
      </div>
      <SignupDetails a={a} locale={locale} select={select} />
      <Feedback state={state} a={a} />
      <button disabled={pending} className={`${primaryButton} w-full`}>{a.create}</button>
      <p className="text-[0.9rem] text-ash">
        {a.haveAccount} <Link href={loginHref} className={link}>{a.loginLink}</Link>
      </p>
    </form>
  );
}

export function CompleteSignupForm({ action, a, locale, select }: { action: Action; a: A; locale: string; select: string }) {
  const [state, formAction, pending] = useKeepAction(action);
  return (
    <form onSubmit={formAction} className="space-y-6">
      <SignupDetails a={a} locale={locale} select={select} />
      <Feedback state={state} a={a} />
      <button disabled={pending} className={`${primaryButton} w-full`}>{a.completeSubmit}</button>
    </form>
  );
}

export function LoginForm({ action, a, signupHref, forgotHref }: { action: Action; a: A; signupHref: string; forgotHref: string }) {
  const [state, formAction, pending] = useKeepAction(action);
  // Conta protegida: a senha não é conferida; a entrada segue com o código enviado ao e-mail.
  if (state?.challenge && state.email) {
    return (
      <form onSubmit={formAction} className="space-y-6" data-testid="login-codigo">
        <div className="space-y-2">
          <p className="font-medium text-bone">{a.challengeTitle}</p>
          <p className="text-[0.95rem] leading-relaxed text-fog">{a.challengeLead}</p>
          <p className="text-[0.95rem] text-ash">{state.email}</p>
        </div>
        <input type="hidden" name="email" value={state.email} />
        <TextField label={a.code} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} />
        <Feedback state={state} a={a} />
        <button name="intent" value="code" disabled={pending} className={`${primaryButton} w-full`}>{a.enterWithCode}</button>
        <div className="flex flex-wrap items-center justify-between gap-4 text-[0.9rem] text-ash">
          <button name="intent" value="resend" disabled={pending} className={textButton}>{a.resend}</button>
          <a href="" className={textButton}>{a.otherAccount}</a>
        </div>
      </form>
    );
  }
  return (
    <form onSubmit={formAction} className="space-y-6">
      <TextField label={a.email} name="email" type="email" autoComplete="email" required />
      <TextField label={a.password} name="password" type="password" autoComplete="current-password" required />
      <Feedback state={state} a={a} />
      <button name="intent" value="password" disabled={pending} className={`${primaryButton} w-full`}>{a.enter}</button>
      <div className="flex flex-wrap items-center justify-between gap-4 text-[0.9rem] text-ash">
        <p>{a.noAccount} <Link href={signupHref} className={link}>{a.signupLink}</Link></p>
        <Link href={forgotHref} className={textButton}>{a.forgot}</Link>
      </div>
    </form>
  );
}

/** Código de verificação do e-mail + reenvio. `email` só aparece quando não há sessão. */
export function VerifyForm({ verify, resend, a, email, askEmail }: { verify: Action; resend: Action; a: A; email: string; askEmail: boolean }) {
  const [state, formAction, pending] = useKeepAction(verify);
  const [sent, resendAction, sending] = useKeepAction(resend);
  return (
    <div className="space-y-8">
      <form onSubmit={formAction} className="space-y-6">
        {askEmail ? (
          <TextField label={a.email} name="email" type="email" autoComplete="email" required defaultValue={email} />
        ) : (
          <p className="text-[0.95rem] text-fog">{a.verifyLeadTo} <span className="text-bone">{email}</span></p>
        )}
        <TextField label={a.code} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
        <Feedback state={state} a={a} />
        <button disabled={pending} className={`${primaryButton} w-full`}>{a.verify}</button>
      </form>
      <form onSubmit={resendAction} className="space-y-4 border-t border-white/10 pt-6">
        {askEmail && <input type="hidden" name="email" value={email} />}
        <Feedback state={sent} a={a} />
        <button disabled={sending} className={textButton}>{a.resend}</button>
      </form>
    </div>
  );
}

export function ForgotForm({ action, a, loginHref }: { action: Action; a: A; loginHref: string }) {
  const [state, formAction, pending] = useKeepAction(action);
  return (
    <form onSubmit={formAction} className="space-y-6">
      <TextField label={a.email} name="email" type="email" autoComplete="email" required />
      <Feedback state={state} a={a} />
      <button disabled={pending} className={`${primaryButton} w-full`}>{a.sendCode}</button>
      <Link href={loginHref} className={textButton}>{a.backToLogin}</Link>
    </form>
  );
}

export function ResetForm({ action, a, email, loginHref, otherHref }: { action: Action; a: A; email: string; loginHref: string; otherHref: string }) {
  const [state, formAction, pending] = useKeepAction(action);
  if (state?.message === "passwordChanged") {
    return (
      <div className="space-y-6">
        <Feedback state={state} a={a} />
        <Link href={loginHref} className={`${primaryButton} w-full`}>{a.enter}</Link>
      </div>
    );
  }
  return (
    <form onSubmit={formAction} className="space-y-6">
      <input type="hidden" name="email" value={email} />
      <p className="text-[0.95rem] text-fog">{a.verifyLeadTo} <span className="text-bone">{email}</span></p>
      <TextField label={a.code} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
      <div className="grid gap-6 sm:grid-cols-2">
        <TextField label={a.newPassword} name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} hint={a.passwordHint} />
        <TextField label={a.confirm} name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
      </div>
      <Feedback state={state} a={a} />
      <button disabled={pending} className={`${primaryButton} w-full`}>{a.savePassword}</button>
      <Link href={otherHref} className={textButton}>{a.otherEmail}</Link>
    </form>
  );
}
