"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { PanelDictionary } from "@/i18n/get-dictionary";
import type { FormState } from "@/lib/panel/actions";
import { TextField, primaryButton } from "./controls";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

function Consent({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer gap-3 text-[0.9rem] leading-snug text-fog">
      <input type="checkbox" name={name} required className="mt-0.5 size-5 shrink-0 accent-[#4f9a6a]" />
      <span>{children}</span>
    </label>
  );
}

function Feedback({ state, a }: { state: FormState; a: PanelDictionary["auth"] }) {
  if (state?.message === "checkEmail") return <p className="border-l-2 border-grass pl-4 text-bone">{a.checkEmail}</p>;
  if (!state?.error) return null;
  const msg = (a.errors as Record<string, string>)[state.error] ?? a.errors.generic;
  return <p role="alert" className="border-l-2 border-[#e5a3a3] pl-4 text-[#f0c4c4]">{msg}</p>;
}

export function SignupForm({ action, a, loginHref }: { action: Action; a: PanelDictionary["auth"]; loginHref: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-6">
      <TextField label={a.fullName} name="full_name" autoComplete="name" required minLength={3} />
      <div className="grid gap-6 sm:grid-cols-2">
        <TextField label={a.email} name="email" type="email" autoComplete="email" required />
        <TextField label={a.whatsapp} name="whatsapp" type="tel" autoComplete="tel" inputMode="tel" placeholder="+55 11 90000-0000" required hint={a.whatsappHint} />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <TextField label={a.password} name="password" type="password" autoComplete="new-password" required minLength={8} hint={a.passwordHint} />
        <TextField label={a.confirm} name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </div>
      <div className="space-y-4 border-t border-white/10 pt-6">
        <Consent name="terms">{a.terms}</Consent>
        <Consent name="privacy">{a.privacy}</Consent>
        <Consent name="guardian_declaration">{a.guardian}</Consent>
        <Consent name="no_guarantee">{a.noGuarantee}</Consent>
      </div>
      <Feedback state={state} a={a} />
      <button disabled={pending} className={`${primaryButton} w-full`}>{a.create}</button>
      <p className="text-[0.9rem] text-ash">
        {a.haveAccount} <Link href={loginHref} className="text-bone underline-offset-4 hover:underline">{a.loginLink}</Link>
      </p>
    </form>
  );
}

export function LoginForm({ action, a, signupHref }: { action: Action; a: PanelDictionary["auth"]; signupHref: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-6">
      <TextField label={a.email} name="email" type="email" autoComplete="email" required />
      <TextField label={a.password} name="password" type="password" autoComplete="current-password" required />
      <Feedback state={state} a={a} />
      <button disabled={pending} className={`${primaryButton} w-full`}>{a.enter}</button>
      <p className="text-[0.9rem] text-ash">
        {a.noAccount} <Link href={signupHref} className="text-bone underline-offset-4 hover:underline">{a.signupLink}</Link>
      </p>
    </form>
  );
}
