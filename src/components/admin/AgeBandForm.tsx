"use client";

import { useKeepAction } from "@/components/forms/use-keep-action";
import type { FormState } from "@/lib/panel/actions";
import { control, ghostButton, primaryButton } from "@/components/panel/controls";

/** Faixa de idade da organização: mínimo e máximo (piso do tipo até 22), motivo obrigatório. */
export function AgeBandForm({ action, floor, min, max, custom }: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  floor: number; min: number; max: number; custom: boolean;
}) {
  const [state, formAction, pending] = useKeepAction(action);
  return (
    <form onSubmit={formAction} className="space-y-3" data-testid="form-faixa">
      <div className="flex flex-wrap gap-3">
        <label className="block w-32">
          <span className="eyebrow text-fog">Idade mínima</span>
          <input type="number" name="age_min" min={floor} max={22} defaultValue={min} required className={control} />
        </label>
        <label className="block w-32">
          <span className="eyebrow text-fog">Idade máxima</span>
          <input type="number" name="age_max" min={floor} max={22} defaultValue={max} required className={control} />
        </label>
      </div>
      <label className="block">
        <span className="eyebrow text-fog">Motivo (registrado na auditoria)</span>
        <textarea name="note" maxLength={1000} required minLength={5} className={`${control} h-20 resize-y py-3 leading-relaxed`} />
      </label>
      <div className="flex flex-wrap gap-3">
        <button name="decision" value="set" disabled={pending} className={primaryButton}>Autorizar faixa</button>
        {custom && <button name="decision" value="reset" formNoValidate disabled={pending} className={ghostButton}>Voltar ao padrão do tipo</button>}
      </div>
      {state?.error && <p role="alert" className="border-l-2 border-[#e5a3a3] pl-4 text-[0.9rem] text-[#f0c4c4]">{state.error}</p>}
      {state?.ok && <p role="status" className="border-l-2 border-grass pl-4 text-[0.9rem] text-bone">{state.message}</p>}
    </form>
  );
}
