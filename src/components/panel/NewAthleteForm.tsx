"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { PanelDictionary } from "@/i18n/get-dictionary";
import type { FormState } from "@/lib/panel/actions";
import { countryOptions } from "@/domain/athlete";
import { SelectField, TextField, primaryButton } from "./controls";

export function NewAthleteForm({ action, p, cancelHref, locale, defaultCountry }: { action: (s: FormState, fd: FormData) => Promise<FormState>; p: PanelDictionary; cancelHref: string; locale: string; defaultCountry?: string | null }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const f = p.fields;
  return (
    <form action={formAction} className="mt-12 space-y-6">
      <TextField label={f.fullName} name="full_name" required minLength={3} autoComplete="off" />
      <div className="grid gap-6 sm:grid-cols-2">
        <TextField label={f.sportName} name="sport_name" optional={p.form.optional} />
        <TextField label={f.birthDate} name="birth_date" type="date" required min="1990-01-01" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <SelectField label={f.country} name="country" defaultValue={defaultCountry ?? ""} placeholder={p.form.select} required options={countryOptions(locale)} />
        <SelectField
          label={p.newAthlete.relation} name="relation" defaultValue="legal_guardian"
          options={Object.entries(p.newAthlete.relations).map(([value, label]) => ({ value, label }))}
        />
      </div>
      {state?.error && <p role="alert" className="border-l-2 border-[#e5a3a3] pl-4 text-[#f0c4c4]">{p.form.error}</p>}
      <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center">
        <button disabled={pending} className={`${primaryButton} w-full sm:w-auto sm:min-w-[16rem]`}>{p.newAthlete.create}</button>
        <Link href={cancelHref} className="text-center text-[0.9rem] text-ash hover:text-bone">{p.form.back}</Link>
      </div>
    </form>
  );
}
