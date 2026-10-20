"use client";

import { startTransition, useActionState, type FormEvent } from "react";

/**
 * Igual a useActionState, mas o formulário NÃO é limpo depois do envio.
 * (No React 19, <form action={...}> zera os campos após cada envio — inclusive quando o
 * servidor devolve erro, o que fazia a família perder o que digitou.)
 * Envia o botão clicado (ex.: intent=next, decision=approve) junto com os campos.
 * Para limpar após sucesso, chame form.reset() no componente (ex.: adicionar vídeo).
 */
export function useKeepAction<S>(action: (state: Awaited<S>, fd: FormData) => S | Promise<S>) {
  const [state, dispatch, pending] = useActionState(action, undefined as Awaited<S>);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(fd));
  };
  return [state, onSubmit, pending] as const;
}
