"use server";

import { redirect } from "next/navigation";
import { asUser } from "@/lib/db";
import { currentUser, getAuth } from "./server";
import { closeMfa } from "./mfa";
import { deleteBlobFiles } from "@/lib/photos/server";
import { hasLocale } from "@/i18n/config";

export type AccountFormState = { error?: string } | undefined;

/**
 * Exclusão da própria conta (LGPD). O banco apaga login, perfil, consentimentos e os
 * atletas dos quais a pessoa é a única responsável; o servidor apaga as fotos no Blob.
 * Confirmação: digitar o próprio e-mail.
 */
export async function deleteMyAccount(lang: string, _prev: AccountFormState, fd: FormData): Promise<AccountFormState> {
  const l = hasLocale(lang) ? lang : "pt";
  const user = await currentUser();
  if (!user) redirect(`/${l}/entrar`);
  if (String(fd.get("confirm") ?? "").trim().toLowerCase() !== user.email.toLowerCase()) return { error: "confirm" };
  let blobs: string[] = [];
  try {
    const [r] = await asUser<{ blobs: string[] }>(user.id, (q) => q`select account_delete(${user.id}::uuid) as blobs`);
    blobs = r?.blobs ?? [];
  } catch {
    return { error: "generic" };
  }
  await deleteBlobFiles(blobs);
  await closeMfa().catch(() => {});
  try {
    await getAuth()?.signOut();
  } catch {
    /* a sessão já não tem usuário */
  }
  redirect(`/${l}?conta=excluida`);
}
