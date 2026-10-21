"use client";

import { useKeepAction } from "@/components/forms/use-keep-action";
import type { FormState } from "@/lib/panel/actions";
import type { AiConsole } from "@/lib/admin/data";
import { TextField, primaryButton } from "@/components/panel/controls";

/** Orçamento e limites da IA. Não liga a IA real (isso exige as três travas e nova autorização). */
export function AiSettingsForm({ action, s }: { action: (st: FormState, fd: FormData) => Promise<FormState>; s: AiConsole["settings"] }) {
  const [state, formAction, pending] = useKeepAction(action);
  return (
    <form onSubmit={formAction} className="grid gap-4 sm:grid-cols-2">
      <TextField label="Orçamento diário (US$)" name="daily" type="number" step="0.5" min={0} max={1000} required defaultValue={s.daily_budget_usd} />
      <TextField label="Orçamento mensal (US$)" name="monthly" type="number" step="1" min={0} max={10000} required defaultValue={s.monthly_budget_usd} />
      <TextField label="Pedidos por atleta em 30 dias" name="max30" type="number" min={1} max={30} required defaultValue={s.max_requests_per_30d} />
      <TextField label="Tamanho do trecho (min)" name="segment" type="number" min={5} max={60} required defaultValue={s.segment_minutes} />
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <button disabled={pending} className={primaryButton}>Salvar limites da IA</button>
        {state?.error && <p role="alert" className="text-[#f0c4c4]">{state.error}</p>}
        {state?.ok && <p role="status" className="text-bone">{state.message}</p>}
      </div>
    </form>
  );
}
