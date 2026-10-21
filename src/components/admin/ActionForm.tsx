"use client";

import { useKeepAction } from "@/components/forms/use-keep-action";
import type { FormState } from "@/lib/panel/actions";
import { control, ghostButton, primaryButton } from "@/components/panel/controls";

type Option = { value?: string; label: string; tone?: "primary" | "danger" };

/**
 * Formulário de uma ação do admin: motivo (opcional ou obrigatório), campos extras,
 * confirmação digitada para ações irreversíveis e um ou mais botões de decisão.
 */
export function ActionForm({
  action, buttons, note, noteRequired = false, number, checkbox, confirmWord, testId,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  buttons: Option[];
  note?: string;
  noteRequired?: boolean;
  number?: { name: string; label: string; min: number; max: number; defaultValue: number };
  checkbox?: { name: string; label: string };
  confirmWord?: string;
  testId?: string;
}) {
  const [state, formAction, pending] = useKeepAction(action);
  return (
    <form onSubmit={formAction} className="space-y-3" data-testid={testId}>
      {note && (
        <label className="block">
          <span className="eyebrow text-fog">{note}</span>
          <textarea name="note" maxLength={1000} required={noteRequired} minLength={noteRequired ? 5 : undefined}
            className={`${control} h-20 resize-y py-3 leading-relaxed`} />
        </label>
      )}
      {number && (
        <label className="block max-w-[12rem]">
          <span className="eyebrow text-fog">{number.label}</span>
          <input type="number" name={number.name} min={number.min} max={number.max} defaultValue={number.defaultValue} required className={control} />
        </label>
      )}
      {checkbox && (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[0.9rem] text-fog">
          <input type="checkbox" name={checkbox.name} className="size-5 accent-[#4f9a6a]" /> {checkbox.label}
        </label>
      )}
      {confirmWord && (
        <label className="block max-w-xs">
          <span className="eyebrow text-fog">Digite {confirmWord} para confirmar</span>
          <input name="confirm" required autoComplete="off" className={control} />
        </label>
      )}
      <div className="flex flex-wrap gap-3">
        {buttons.map((b) => (
          <button key={b.label} name={b.value ? "decision" : undefined} value={b.value} disabled={pending}
            className={b.tone === "primary" ? primaryButton : `${ghostButton} ${b.tone === "danger" ? "border-[#e5a3a3]/50 text-[#f0c4c4] hover:border-[#e5a3a3]" : ""}`}>
            {b.label}
          </button>
        ))}
      </div>
      {state?.error && <p role="alert" className="border-l-2 border-[#e5a3a3] pl-4 text-[0.9rem] text-[#f0c4c4]">{state.error}</p>}
      {state?.ok && <p role="status" className="border-l-2 border-grass pl-4 text-[0.9rem] text-bone">{state.message}</p>}
    </form>
  );
}
