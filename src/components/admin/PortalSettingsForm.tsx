"use client";

import { useKeepAction } from "@/components/forms/use-keep-action";
import type { FormState } from "@/lib/panel/actions";
import type { PortalSettings } from "@/lib/admin/data";
import { TextField, primaryButton } from "@/components/panel/controls";

/** Limites configuráveis do portal (o banco confere se quem salva é admin). */
export function PortalSettingsForm({ action, settings }: { action: (s: FormState, fd: FormData) => Promise<FormState>; settings: PortalSettings }) {
  const [state, formAction, pending] = useKeepAction(action);
  return (
    <form onSubmit={formAction} className="mt-6 grid max-w-3xl gap-6 sm:grid-cols-3">
      <TextField label="Fichas por dia (por profissional)" name="views" type="number" min={1} max={10000} required defaultValue={settings.profile_views_per_day} />
      <TextField label="Interesses por mês (por organização)" name="interests" type="number" min={1} max={1000} required defaultValue={settings.interests_per_month} />
      <TextField label="Prazo de resposta (dias)" name="expiry" type="number" min={1} max={365} required defaultValue={settings.interest_expiry_days} />
      <div className="sm:col-span-3 flex flex-wrap items-center gap-4">
        <button disabled={pending} className={primaryButton}>Salvar limites</button>
        {state?.error && <p role="alert" className="text-[#f0c4c4]">{state.error}</p>}
        {state?.ok && <p role="status" className="text-bone">{state.message}</p>}
      </div>
    </form>
  );
}
