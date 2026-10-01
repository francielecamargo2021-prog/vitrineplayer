"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/lib/panel/actions";
import { ghostButton, primaryButton } from "./controls";

/**
 * Formulário de etapa: salva como rascunho a qualquer momento ("Salvar") ou
 * salva e avança. O servidor revalida tudo; aqui só há estado de envio/erro.
 */
export function StepForm({
  action, children, labels, exitHref, hideNext = false,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  children: React.ReactNode;
  labels: { save: string; saveNext: string; saved: string; error: string; exit: string };
  exitHref: string;
  hideNext?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-10">
      {children}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t border-white/10 bg-ink/95 px-4 py-4 backdrop-blur md:static md:mx-0 md:flex-row md:items-center md:border-0 md:bg-transparent md:px-0 md:py-0">
        {!hideNext && (
          <button name="intent" value="next" disabled={pending} className={`${primaryButton} w-full md:w-auto md:min-w-[16rem]`}>
            {labels.saveNext}
          </button>
        )}
        <button name="intent" value="save" disabled={pending} className={`${ghostButton} w-full md:w-auto`}>
          {labels.save}
        </button>
        <Link href={exitHref} className="text-center text-[0.875rem] text-ash transition-colors hover:text-bone md:ml-auto">
          {labels.exit}
        </Link>
        <p aria-live="polite" className={`text-[0.875rem] ${state?.error ? "text-[#e5a3a3]" : "text-grass"}`}>
          {pending ? "" : state?.error ? labels.error : state?.ok ? labels.saved : ""}
        </p>
      </div>
    </form>
  );
}
