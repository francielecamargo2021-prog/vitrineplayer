"use client";

import { useKeepAction } from "@/components/forms/use-keep-action";
import type { PanelDictionary, PortalDictionary } from "@/i18n/get-dictionary";
import type { AuthFormState } from "@/lib/auth/actions";
import { countryOptions } from "@/domain/athlete";
import { SelectField, TextField, primaryButton } from "@/components/panel/controls";

type Action = (prev: AuthFormState, fd: FormData) => Promise<AuthFormState>;

/** Entrar na equipe pelo convite: conta (se nova) + WhatsApp, país e termos profissionais. */
export function JoinForm({ action, t, a, locale, select, withAccount }: {
  action: Action; t: PortalDictionary; a: PanelDictionary["auth"]; locale: string; select: string; withAccount: boolean;
}) {
  const [state, formAction, pending] = useKeepAction(action);
  const s = t.signup;
  const errors: Record<string, string> = { ...(a.errors as Record<string, string>), ...(s.errors as Record<string, string>), invite: t.join.invalid, full: t.team.full };
  return (
    <form onSubmit={formAction} className="space-y-6">
      {withAccount && (
        <>
          <TextField label={s.fullName} name="full_name" autoComplete="name" required minLength={3} />
          <TextField label={a.email} name="email" type="email" autoComplete="email" required />
          <div className="grid gap-6 sm:grid-cols-2">
            <TextField label={a.password} name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} hint={a.passwordHint} />
            <TextField label={a.confirm} name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
          </div>
        </>
      )}
      <TextField label={s.whatsapp} name="whatsapp" type="tel" autoComplete="tel" inputMode="tel" required hint={s.whatsappHint} />
      <SelectField label={s.country} name="country" required placeholder={select} options={countryOptions(locale)} />
      <div className="space-y-4 border-t border-white/10 pt-6">
        {(["terms", "privacy", "pro_conduct"] as const).map((k) => (
          <label key={k} className="flex cursor-pointer gap-3 text-[0.9rem] leading-snug text-fog">
            <input type="checkbox" name={k} required className="mt-0.5 size-5 shrink-0 accent-[#4f9a6a]" />
            <span>{k === "pro_conduct" ? s.conduct : s[k]}</span>
          </label>
        ))}
      </div>
      {state?.error && <p role="alert" className="border-l-2 border-[#e5a3a3] pl-4 text-[#f0c4c4]">{errors[state.error] ?? a.errors.generic}</p>}
      <button disabled={pending} className={`${primaryButton} w-full`}>{withAccount ? t.join.create : t.join.complete}</button>
    </form>
  );
}
