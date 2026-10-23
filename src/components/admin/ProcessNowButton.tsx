"use client";

import { useState } from "react";
import { useKeepAction } from "@/components/forms/use-keep-action";
import type { FormState } from "@/lib/panel/actions";
import { ghostButton, primaryButton, textButton } from "@/components/panel/controls";

/**
 * "Processar agora": duas etapas na própria página (sem caixa de diálogo do navegador).
 * A primeira mostra o custo máximo; a segunda envia UMA chamada ao Gemini.
 */
export function ProcessNowButton({ action, maxCost, model }: { action: (st: FormState, fd: FormData) => Promise<FormState>; maxCost: string; model: string }) {
  const [state, formAction, pending] = useKeepAction(action);
  const [confirming, setConfirming] = useState(false);
  if (state?.ok) return <p role="status" className="mt-2 text-bone" data-testid="processar-resultado">{state.message}</p>;
  return (
    <div className="mt-2 space-y-2" data-testid="processar-agora">
      {!confirming ? (
        <button type="button" className={ghostButton} onClick={() => setConfirming(true)}>Processar agora</button>
      ) : (
        <form onSubmit={formAction} className="space-y-2 border-l-2 border-grass pl-4">
          <p className="text-[0.9rem] text-bone">Enviar este vídeo ao Google Gemini ({model}) agora? Custo máximo previsto: {maxCost}. O relatório fica primeiro só para a família, que decide se publica.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={pending} className={primaryButton}>{pending ? "Analisando… pode levar alguns minutos" : "Confirmar e analisar"}</button>
            {!pending && <button type="button" className={textButton} onClick={() => setConfirming(false)}>Cancelar</button>}
          </div>
        </form>
      )}
      {state?.error && <p role="alert" className="text-[#f0c4c4]">{state.error}</p>}
    </div>
  );
}
