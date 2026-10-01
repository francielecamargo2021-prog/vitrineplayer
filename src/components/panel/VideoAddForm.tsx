"use client";

import { useActionState, useEffect, useRef } from "react";
import type { PanelDictionary } from "@/i18n/get-dictionary";
import type { FormState } from "@/lib/panel/actions";
import { videoTypes } from "@/domain/athlete";
import { SelectField, TextField, ghostButton } from "./controls";

export function VideoAddForm({ action, t, optional }: { action: (s: FormState, fd: FormData) => Promise<FormState>; t: PanelDictionary["videos"]; optional: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state]);
  return (
    <form ref={form} action={formAction} className="grid gap-5 border border-white/12 p-5 sm:grid-cols-2 md:p-6">
      <TextField label={t.url} name="url" type="url" inputMode="url" required placeholder="https://youtube.com/watch?v=…" className="sm:col-span-2" />
      <TextField label={t.title} name="title" maxLength={120} />
      <SelectField label={t.type} name="video_type" defaultValue="highlights" options={videoTypes.map((v) => ({ value: v, label: t.types[v] }))} />
      <TextField label={t.description} name="description" maxLength={280} optional={optional} className="sm:col-span-2" />
      {state?.error && <p role="alert" className="text-[#f0c4c4] sm:col-span-2">{t.invalid}</p>}
      <button disabled={pending} className={`${ghostButton} sm:col-span-2 sm:justify-self-start`}>+ {t.add}</button>
    </form>
  );
}
