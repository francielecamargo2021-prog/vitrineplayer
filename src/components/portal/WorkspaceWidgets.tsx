"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useKeepAction } from "@/components/forms/use-keep-action";
import { addEvaluation, addNote, deleteEvaluation, deleteNote, setStage, type PortalState } from "@/lib/portal/actions";
import type { PortalDictionary } from "@/i18n/get-dictionary";
import { TextArea, TextField, control, primaryButton } from "@/components/panel/controls";

type W = PortalDictionary["workspace"];

export function StageSelect({ lang, athleteId, stage, t }: { lang: string; athleteId: string; stage: string | null; t: W }) {
  const [value, setValue] = useState(stage ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <label className="block">
      <span className="eyebrow text-fog">{t.stage}</span>
      <select value={value} disabled={pending} aria-label={t.stage} className={control} data-testid="etapa"
        onChange={(e) => {
          const prev = value, next = e.target.value;
          setValue(next);
          start(async () => {
            const r = await setStage(lang, athleteId, next);
            if (r?.error) setValue(prev);
            router.refresh();
          });
        }}>
        <option value="">{t.stageNone}</option>
        {Object.entries(t.stages).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}

function Feedback({ state, t }: { state: PortalState; t: W }) {
  if (!state?.error) return null;
  return <p role="alert" className="text-[0.9rem] text-[#f0c4c4]">{(t.errors as Record<string, string>)[state.error] ?? t.errors.generic}</p>;
}

export function NoteForm({ lang, athleteId, t }: { lang: string; athleteId: string; t: W }) {
  const [state, formAction, pending] = useKeepAction(addNote.bind(null, lang, athleteId));
  return (
    <form key={state?.message ?? "form"} onSubmit={formAction} className="space-y-3" data-testid="nova-nota">
      <TextArea label={t.notes} name="body" required maxLength={2000} placeholder={t.notePlaceholder} />
      <TextField label={t.tags} name="tags" maxLength={200} hint={t.tagsHint} />
      <Feedback state={state} t={t} />
      <button disabled={pending} className={`${primaryButton} w-full`}>{t.addNote}</button>
    </form>
  );
}

export function DeleteButton({ kind, lang, id, label }: { kind: "note" | "evaluation"; lang: string; id: string; label: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button type="button" disabled={pending} className="text-[0.8rem] text-ash underline-offset-4 hover:text-[#f0c4c4] hover:underline"
      onClick={() => start(async () => { await (kind === "note" ? deleteNote : deleteEvaluation)(lang, id); router.refresh(); })}>
      {label}
    </button>
  );
}

/** Avaliação pela rubrica da posição: 1–5 por fundamento (vazio = não observado). */
export function EvaluationForm({ lang, athleteId, group, rubric, criteria, videos, t, formative = false }: {
  lang: string; athleteId: string; group: string; rubric: string; formative?: boolean;
  criteria: { key: string; label: string }[]; videos: { id: string; label: string }[]; t: W;
}) {
  const [state, formAction, pending] = useKeepAction(addEvaluation.bind(null, lang, athleteId, group, rubric, criteria.map((c) => c.key)));
  return (
    <form key={state?.message ?? "form"} onSubmit={formAction} className="space-y-4" data-testid="nova-avaliacao">
      <p className="text-[0.85rem] text-ash">{formative ? t.evaluationFormativeLead : t.evaluationLead}</p>
      {!formative && <fieldset className="space-y-2">
        {criteria.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-2">
            <span className="text-[0.9rem] text-fog">{c.label}</span>
            <span className="flex gap-1" role="radiogroup" aria-label={c.label}>
              {["", "1", "2", "3", "4", "5"].map((v) => (
                <label key={v} className="cursor-pointer">
                  <input type="radio" name={`s_${c.key}`} value={v} defaultChecked={v === ""} className="peer sr-only" />
                  <span className="grid size-9 place-items-center border border-white/12 text-[0.85rem] text-ash peer-checked:border-grass peer-checked:bg-grass/20 peer-checked:text-bone peer-focus-visible:outline peer-focus-visible:outline-2">
                    {v || t.notObserved}
                  </span>
                </label>
              ))}
            </span>
          </div>
        ))}
      </fieldset>}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="eyebrow text-fog">{t.context}</span>
          <select name="context" defaultValue="video" className={control}>
            {Object.entries(t.contexts).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="eyebrow text-fog">{t.video}</span>
          <select name="media" defaultValue="" className={control}>
            <option value="">{t.videoNone}</option>
            {videos.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </label>
        <TextField label={t.minute} name="minute" type="number" min={0} max={200} />
      </div>
      <TextArea label={t.observation} name="observation" maxLength={2000} required={formative} minLength={formative ? 10 : undefined} />
      <Feedback state={state} t={t} />
      <button disabled={pending} className={`${primaryButton} w-full`}>{t.saveEvaluation}</button>
    </form>
  );
}
