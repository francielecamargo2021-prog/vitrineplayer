"use client";

import { useKeepAction } from "@/components/forms/use-keep-action";
import Link from "next/link";
import type { PanelDictionary } from "@/i18n/get-dictionary";
import type { FormState } from "@/lib/panel/actions";
import { birthDateBounds, countryOptions } from "@/domain/athlete";
import { SelectField, TextField, primaryButton } from "./controls";

export function NewAthleteForm({ action, p, cancelHref, locale, defaultCountry }: { action: (s: FormState, fd: FormData) => Promise<FormState>; p: PanelDictionary; cancelHref: string; locale: string; defaultCountry?: string | null }) {
  const [state, formAction, pending] = useKeepAction(action);
  const f = p.fields;
  const bounds = birthDateBounds();
  return (
    <form onSubmit={formAction} className="mt-12 space-y-6">
      <TextField label={f.fullName} name="full_name" required minLength={3} autoComplete="off" />
      <div className="grid gap-6 sm:grid-cols-2">
        <TextField label={f.sportName} name="sport_name" optional={p.form.optional} />
        <TextField label={f.birthDate} name="birth_date" type="date" required min={bounds.min} max={bounds.max} hint={p.form.ageRange} />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <SelectField label={f.country} name="country" defaultValue={defaultCountry ?? ""} placeholder={p.form.select} required options={countryOptions(locale)} />
        <SelectField
          label={p.newAthlete.relation} name="relation" defaultValue="legal_guardian"
          options={Object.entries(p.newAthlete.relations).map(([value, label]) => ({ value, label }))}
        />
      </div>
      {state?.error && <p role="alert" className="border-l-2 border-[#e5a3a3] pl-4 text-[#f0c4c4]">{state.error === "minorSelf" ? p.form.minorSelf : state.error === "ageRange" ? p.form.ageRange : p.form.error}</p>}
      <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center">
        <button disabled={pending} className={`${primaryButton} w-full sm:w-auto sm:min-w-[16rem]`}>{p.newAthlete.create}</button>
        <Link href={cancelHref} className="text-center text-[0.9rem] text-ash hover:text-bone">{p.form.back}</Link>
      </div>
    </form>
  );
}
