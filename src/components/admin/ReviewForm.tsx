"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/lib/panel/actions";
import { control, ghostButton, primaryButton } from "@/components/panel/controls";

export type DecisionOption = { value: string; label: string; needsNote: boolean; tone?: "primary" | "danger" };

/**
 * Decisão do administrador: um botão por decisão possível na situação atual.
 * Rejeitar e suspender pedem motivo (o banco também exige).
 */
export function ReviewForm({
  action, options, noteLabel = "Motivo (mostrado ao responsável)", compact = false,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  options: DecisionOption[];
  noteLabel?: string;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [choice, setChoice] = useState<string | null>(null);
  const needsNote = options.find((o) => o.value === choice)?.needsNote ?? false;
  if (!options.length) return <p className="text-[0.85rem] text-ash">Nenhuma decisão disponível nesta situação.</p>;

  return (
    <form action={formAction} className={compact ? "space-y-3" : "space-y-5"}>
      {options.some((o) => o.needsNote) && (
        <label className="block">
          <span className="eyebrow text-fog">{noteLabel}</span>
          <textarea name="note" maxLength={1000} required={needsNote} minLength={needsNote ? 5 : undefined}
            className={`${control} ${compact ? "h-20" : "h-28"} resize-y py-3 leading-relaxed`} />
          <span className="mt-1.5 block text-[0.8rem] text-ash">Obrigatório para rejeitar ou suspender.</span>
        </label>
      )}
      <div className="flex flex-wrap gap-3">
        {options.map((o) => (
          <button key={o.value} name="decision" value={o.value} disabled={pending} onClick={() => setChoice(o.value)}
            className={o.tone === "primary" ? `${primaryButton} min-w-[10rem]` : `${ghostButton} ${o.tone === "danger" ? "border-[#e5a3a3]/50 text-[#f0c4c4] hover:border-[#e5a3a3]" : ""}`}>
            {o.label}
          </button>
        ))}
      </div>
      {state?.error && <p role="alert" className="border-l-2 border-[#e5a3a3] pl-4 text-[0.9rem] text-[#f0c4c4]">{state.error}</p>}
      {state?.ok && <p role="status" className="border-l-2 border-grass pl-4 text-[0.9rem] text-bone">{state.message}</p>}
    </form>
  );
}
