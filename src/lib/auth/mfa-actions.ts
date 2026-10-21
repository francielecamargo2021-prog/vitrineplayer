"use server";

import { redirect } from "next/navigation";
import { getAccount } from "./session";
import { beginEnroll, finishEnrollment, redeemRecoveryCode, verifyCode } from "./mfa";
import { hasLocale } from "@/i18n/config";

export type MfaFormState = { ok?: boolean; error?: string; recovery?: string[]; ticket?: string; left?: number } | undefined;
const safeLang = (lang: string) => (hasLocale(lang) ? lang : "pt");

/** Só o próprio admin, logado e com e-mail confirmado, mexe no segundo fator. */
async function admin(lang: string) {
  const a = await getAccount();
  if (!a.backend || !a.user || !a.user.emailVerified || a.profile?.role !== "ADMIN") redirect(`/${safeLang(lang)}/entrar`);
  return a.user;
}

export async function startEnroll(lang: string) {
  const user = await admin(lang);
  await beginEnroll(user.id, user.email);
  redirect(`/${safeLang(lang)}/entrar/segundo-fator`);
}

export async function submitCode(lang: string, _prev: MfaFormState, fd: FormData): Promise<MfaFormState> {
  const user = await admin(lang);
  const r = await verifyCode(user.id, String(fd.get("code") ?? "").replace(/\s/g, ""));
  if (!r.ok) return { error: r.error };
  if (r.recovery) return { ok: true, recovery: r.recovery, ticket: r.ticket };
  redirect(`/${safeLang(lang)}/admin`);
}

export async function submitRecovery(lang: string, _prev: MfaFormState, fd: FormData): Promise<MfaFormState> {
  const user = await admin(lang);
  const r = await redeemRecoveryCode(user.id, String(fd.get("recovery") ?? ""));
  if (!r.ok) return { error: r.error };
  redirect(`/${safeLang(lang)}/admin`);
}

/** Depois de guardar os códigos de recuperação: grava o cookie do segundo fator e abre o admin. */
export async function finishMfaEnrollment(lang: string, ticket: string) {
  const user = await admin(lang);
  if (!(await finishEnrollment(user.id, ticket))) redirect(`/${safeLang(lang)}/entrar/segundo-fator`);
  redirect(`/${safeLang(lang)}/admin`);
}
