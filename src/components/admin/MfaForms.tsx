"use client";

import Link from "next/link";
import { useKeepAction } from "@/components/forms/use-keep-action";
import { finishMfaEnrollment, type MfaFormState } from "@/lib/auth/mfa-actions";
import { TextField, primaryButton } from "@/components/panel/controls";

type Action = (s: MfaFormState, fd: FormData) => Promise<MfaFormState>;
const errors: Record<string, string> = {
  code: "Código inválido. Confira o horário do celular e tente o código novo.",
  locked: "Muitas tentativas erradas. Aguarde 15 minutos e tente de novo.",
  reused: "Este código já foi usado. Espere o próximo código (30 segundos).",
  setup: "Configure o aplicativo autenticador primeiro.",
};

export function CodeForm({ action, lang }: { action: Action; lang: string }) {
  const [state, formAction, pending] = useKeepAction(action);
  if (state?.recovery) {
    return (
      <div className="space-y-5" data-testid="codigos-recuperacao">
        <p className="border-l-2 border-grass pl-4 text-bone">Segundo fator ativado. Guarde estes 10 códigos de recuperação num lugar seguro: cada um vale uma vez, se você perder o celular. Eles não serão mostrados de novo.</p>
        <ol className="grid grid-cols-2 gap-2 font-mono text-[0.95rem] text-bone">
          {state.recovery.map((c) => <li key={c} className="border border-white/12 px-3 py-2">{c}</li>)}
        </ol>
        <form action={finishMfaEnrollment.bind(null, lang, state.ticket ?? "")}>
          <button className={`${primaryButton} w-full`}>Guardei os códigos — ir para o admin</button>
        </form>
      </div>
    );
  }
  return (
    <form onSubmit={formAction} className="space-y-5">
      <TextField label="Código de 6 dígitos do aplicativo" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
      {state?.error && <p role="alert" className="border-l-2 border-[#e5a3a3] pl-4 text-[#f0c4c4]">{errors[state.error] ?? errors.code}</p>}
      <button disabled={pending} className={`${primaryButton} w-full`}>Confirmar</button>
    </form>
  );
}

export function RecoveryForm({ action, adminHref }: { action: Action; adminHref: string }) {
  const [state, formAction, pending] = useKeepAction(action);
  if (state?.ok) {
    return (
      <div className="space-y-4">
        <p className="border-l-2 border-grass pl-4 text-bone">Código aceito. Restam {state.left} código(s) de recuperação. Configure o aplicativo de novo assim que possível.</p>
        <Link href={adminHref} className={`${primaryButton} w-full`}>Ir para o admin</Link>
      </div>
    );
  }
  return (
    <form onSubmit={formAction} className="space-y-4">
      <TextField label="Código de recuperação (ex.: 1a2b3-c4d5e)" name="recovery" autoComplete="off" required maxLength={11} />
      {state?.error && <p role="alert" className="text-[#f0c4c4]">{errors[state.error] ?? errors.code}</p>}
      <button disabled={pending} className="text-[0.9rem] text-fog underline-offset-4 hover:text-bone hover:underline">Usar código de recuperação</button>
    </form>
  );
}
