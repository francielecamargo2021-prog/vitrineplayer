"use client";

import { useKeepAction } from "@/components/forms/use-keep-action";
import { deleteMyAccount } from "@/lib/auth/account-actions";
import type { PanelDictionary } from "@/i18n/get-dictionary";
import { TextField, ghostButton } from "./controls";

/** Área "Minha conta" (família e profissional): baixar os dados e excluir a conta. */
export function AccountPanel({ lang, t }: { lang: string; t: PanelDictionary["account"] }) {
  const [state, formAction, pending] = useKeepAction(deleteMyAccount.bind(null, lang));
  return (
    <div className="space-y-12">
      <section className="border-t border-white/12 pt-6">
        <h2 className="eyebrow text-bone">{t.exportTitle}</h2>
        <p className="mt-3 max-w-[60ch] text-fog">{t.exportBody}</p>
        {/* download de arquivo gerado pela API (não é navegação entre páginas) */}
        <a download href="/api/conta/exportar" className={`${ghostButton} mt-5`} data-testid="baixar-dados">{t.exportButton}</a>
      </section>
      <section className="border-t border-[#e5a3a3]/40 pt-6">
        <h2 className="eyebrow text-[#f0c4c4]">{t.deleteTitle}</h2>
        <p className="mt-3 max-w-[60ch] text-fog">{t.deleteBody}</p>
        <form onSubmit={formAction} className="mt-5 max-w-md space-y-4" data-testid="excluir-conta">
          <TextField label={t.deleteConfirm} name="confirm" type="email" autoComplete="off" required />
          {state?.error && <p role="alert" className="text-[#f0c4c4]">{t.errors[state.error as keyof typeof t.errors] ?? t.errors.generic}</p>}
          <button disabled={pending} className={`${ghostButton} border-[#e5a3a3]/60 text-[#f0c4c4] hover:border-[#e5a3a3]`}>{t.deleteButton}</button>
        </form>
      </section>
    </div>
  );
}
