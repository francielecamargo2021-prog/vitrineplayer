"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { countries } from "@/domain/athlete";
import { hasLocale } from "@/i18n/config";
import { asUser, dbReady } from "@/lib/db";
import { authEnv, currentUser, getAuth } from "./server";
import { closeMfa } from "./mfa";
import { getLimiter, rememberDevice, requestIp, trustedDevice } from "./rate-limit";

export type AuthFormState = { ok?: boolean; error?: string; message?: string } | undefined;

const CONSENT_VERSION = "2026-10";
const CONSENTS = ["terms", "privacy", "guardian_declaration", "no_guarantee"] as const;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const lower = (fd: FormData, k: string) => str(fd, k).toLowerCase();
const safeLang = (lang: string) => (hasLocale(lang) ? lang : "pt");
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;
const isCode = (v: string) => /^\d{6}$/.test(v);
const cleanPhone = (v: string) => v.replace(/[^\d+]/g, "");
const code = (e: unknown) => String((e as { code?: string } | null)?.code ?? "");
const status = (e: unknown) => Number((e as { status?: number } | null)?.status ?? 0);

function ready() {
  const auth = getAuth();
  return auth && dbReady() ? auth : null;
}

/** Valida WhatsApp, país e os 4 consentimentos (passo 2 do cadastro). */
function signupDetails(fd: FormData) {
  const whatsapp = cleanPhone(str(fd, "whatsapp"));
  const country = (countries as readonly string[]).includes(str(fd, "country")) ? str(fd, "country") : null;
  if (!whatsapp || !country) return { error: "required" } as const;
  if (!/^\+?\d{10,15}$/.test(whatsapp)) return { error: "whatsapp" } as const;
  if (!CONSENTS.every((c) => fd.get(c) === "on")) return { error: "consents" } as const;
  return { whatsapp, country } as const;
}

/** Grava WhatsApp, país, idioma e consentimentos COMO o próprio usuário (uma vez só). */
async function completeSignupAs(userId: string, lang: string, d: { whatsapp: string; country: string }) {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const ua = h.get("user-agent") ?? null;
  const locale = lang === "es" ? "es" : "pt-BR";
  await asUser(userId, (q) => q`select complete_signup(${d.whatsapp}, ${d.country}, ${locale},
    ${[...CONSENTS]}::text[], ${CONSENT_VERSION}, ${ip}, ${ua})`);
}

/** Envia o código de 6 dígitos. Erros não são revelados (não confirma se a conta existe). */
async function sendCode(email: string, type: "email-verification" | "forget-password") {
  const auth = getAuth();
  const limit = await getLimiter()?.otpSend({ email, ip: await requestIp() });
  if (limit && !limit.ok) return "tooMany";
  try {
    const r = await auth?.emailOtp.sendVerificationOtp({ email, type });
    return status(r?.error) === 429 ? "tooMany" : null;
  } catch {
    return null;
  }
}

/** Criação de conta: limite por IP (contas em massa). */
async function signupAllowed() {
  const d = await getLimiter()?.signup({ ip: await requestIp() });
  return !d || d.ok;
}

// ---------------------------------------------------------------- cadastro (passo 1 + passo 2)
export async function signUp(lang: string, _prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const auth = ready();
  if (!auth) return { error: "backend" };
  const fullName = str(fd, "full_name");
  const email = lower(fd, "email");
  const password = String(fd.get("password") ?? "");
  if (fullName.length < 3 || !email || !password) return { error: "required" };
  if (!isEmail(email)) return { error: "email" };
  if (password.length < 8 || password.length > 128) return { error: "password" };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "mismatch" };
  const details = signupDetails(fd);
  if ("error" in details) return { error: details.error };

  const l = safeLang(lang);
  if (!(await signupAllowed())) return { error: "tooMany" };
  const { data, error } = await auth.signUp.email({ email, password, name: fullName });
  if (error || !data?.user?.id) {
    if (/exist/i.test(code(error)) || status(error) === 422) return { error: "exists" };
    return { error: status(error) === 429 ? "tooMany" : "generic" };
  }
  // A sessão nova só vale na próxima requisição: o servidor completa o cadastro com o ID
  // devolvido pelo Neon Auth. Se falhar, a pessoa conclui depois em /cadastro/concluir.
  try {
    await completeSignupAs(data.user.id, l, details);
  } catch {
    /* segue: o painel encaminha para "concluir cadastro" */
  }
  await sendCode(email, "email-verification");
  redirect(`/${l}/entrar/verificar`);
}

/** Passo 2 para contas que ainda não registraram WhatsApp, país e consentimentos. */
export async function completeSignup(lang: string, _prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  if (!ready()) return { error: "backend" };
  const user = await currentUser();
  const l = safeLang(lang);
  if (!user) redirect(`/${l}/entrar`);
  const details = signupDetails(fd);
  if ("error" in details) return { error: details.error };
  try {
    await completeSignupAs(user.id, l, details);
  } catch (e) {
    if (!/already completed/i.test(String((e as Error).message))) return { error: "generic" };
  }
  redirect(`/${l}/painel`);
}

// ---------------------------------------------------------------- entrar / sair
export async function signIn(lang: string, _prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const auth = ready();
  if (!auth) return { error: "backend" };
  const email = lower(fd, "email");
  const password = String(fd.get("password") ?? "");
  const l = safeLang(lang);
  if (!isEmail(email) || !password) return { error: "invalid" };
  // Limite antes de conferir a senha. Mesma resposta exista ou não a conta.
  const limiter = getLimiter();
  const who = { email, ip: await requestIp(), trusted: await trustedDevice(email) };
  const allowed = await limiter?.signinAllowed(who);
  if (allowed && !allowed.ok) return { error: "tooMany" };
  const { data, error } = await auth.signIn.email({ email, password });
  if (error) {
    if (/not_verified/i.test(code(error))) {
      await sendCode(email, "email-verification");
      redirect(`/${l}/entrar/verificar?email=${encodeURIComponent(email)}`);
    }
    if (status(error) === 429) return { error: "tooMany" };
    await limiter?.signinFailed(who);
    return { error: "invalid" };
  }
  await limiter?.signinSucceeded(who);
  await rememberDevice(email);
  if (data?.user && !data.user.emailVerified) {
    await sendCode(email, "email-verification");
    redirect(`/${l}/entrar/verificar`);
  }
  redirect(`/${l}/painel`);
}

export async function signOut(lang: string) {
  await closeMfa().catch(() => {});
  try {
    await getAuth()?.signOut();
  } catch {
    /* sessão já encerrada */
  }
  redirect(`/${safeLang(lang)}/entrar`);
}

// ---------------------------------------------------------------- verificação de e-mail
async function emailFor(fd: FormData) {
  const user = await currentUser();
  return user?.email ?? lower(fd, "email");
}

export async function verifyEmail(lang: string, _prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const auth = ready();
  if (!auth) return { error: "backend" };
  const email = await emailFor(fd);
  const otp = str(fd, "code");
  if (!isEmail(email) || !isCode(otp)) return { error: "code" };
  const limiter = getLimiter();
  const who = { email, ip: await requestIp() };
  const allowed = await limiter?.otpVerifyAllowed(who);
  if (allowed && !allowed.ok) return { error: "tooMany" };
  const { error } = await auth.emailOtp.verifyEmail({ email, otp });
  if (error) {
    if (status(error) === 429) return { error: "tooMany" };
    await limiter?.otpVerifyFailed(who);
    return { error: "code" };
  }
  await limiter?.otpVerifySucceeded(who);
  redirect(`/${safeLang(lang)}/painel`);
}

export async function resendVerification(lang: string, _prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  void lang;
  if (!ready()) return { error: "backend" };
  const email = await emailFor(fd);
  if (!isEmail(email)) return { error: "email" };
  const err = await sendCode(email, "email-verification");
  return err ? { error: err } : { ok: true, message: "codeSent" };
}

// ---------------------------------------------------------------- recuperação de senha
export async function requestPasswordReset(lang: string, _prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  if (!ready()) return { error: "backend" };
  const email = lower(fd, "email");
  if (!isEmail(email)) return { error: "email" };
  const err = await sendCode(email, "forget-password");
  if (err) return { error: err };
  // Mesma resposta exista ou não a conta.
  redirect(`/${safeLang(lang)}/entrar/recuperar?email=${encodeURIComponent(email)}`);
}

/**
 * Troca a senha com o código recebido por e-mail. Chamada direta ao Neon Auth porque o
 * SDK 0.6.0-beta aponta este método para um caminho inexistente (email-otp/passcode → 404).
 */
export async function resetPassword(lang: string, _prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const env = authEnv();
  if (!env || !ready()) return { error: "backend" };
  const email = lower(fd, "email");
  const otp = str(fd, "code");
  const password = String(fd.get("password") ?? "");
  if (!isEmail(email) || !isCode(otp)) return { error: "code" };
  if (password.length < 8 || password.length > 128) return { error: "password" };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "mismatch" };
  const limiter = getLimiter();
  const who = { email, ip: await requestIp() };
  const allowed = await limiter?.otpVerifyAllowed(who);
  if (allowed && !allowed.ok) return { error: "tooMany" };
  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  let r: Response;
  try {
    r = await fetch(`${env.baseUrl}/email-otp/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ email, otp, password }),
      cache: "no-store",
    });
  } catch {
    return { error: "generic" };
  }
  if (!r.ok) {
    if (r.status === 400) await limiter?.otpVerifyFailed(who);
    return { error: r.status === 429 ? "tooMany" : r.status === 400 ? "code" : "generic" };
  }
  await limiter?.otpVerifySucceeded(who);
  return { ok: true, message: "passwordChanged" };
}

// ---------------------------------------------------------------- cadastro profissional
const PRO_CONSENTS = ["terms", "privacy", "pro_conduct"] as const;
const PRO_KINDS = ["club", "manager", "agent", "scout", "school", "scouting_hub"];

/** Dados da organização + WhatsApp, país e consentimentos do profissional. */
function proDetails(fd: FormData) {
  const whatsapp = cleanPhone(str(fd, "whatsapp"));
  const country = (countries as readonly string[]).includes(str(fd, "country")) ? str(fd, "country") : null;
  const orgCountry = (countries as readonly string[]).includes(str(fd, "org_country")) ? str(fd, "org_country") : country;
  const kind = str(fd, "kind");
  const org = {
    name: str(fd, "org_name").slice(0, 120), kind, country: orgCountry, document: str(fd, "document").slice(0, 40),
    license: str(fd, "license").slice(0, 80), state: str(fd, "state").slice(0, 80), city: str(fd, "city").slice(0, 80),
    website: str(fd, "website").slice(0, 200), about: str(fd, "about").slice(0, 600), contact_role: str(fd, "contact_role").slice(0, 80),
  };
  if (!PRO_KINDS.includes(kind)) return { error: "kind" } as const;
  if (!whatsapp || !country || org.name.length < 2 || org.document.length < 3 || org.contact_role.length < 2) return { error: "required" } as const;
  if (!/^\+?\d{10,15}$/.test(whatsapp)) return { error: "whatsapp" } as const;
  if (org.website && !/^https?:\/\/\S+$/i.test(org.website)) return { error: "website" } as const;
  if (!PRO_CONSENTS.every((c) => fd.get(c) === "on")) return { error: "consents" } as const;
  return { whatsapp, country, org } as const;
}

async function completeProAs(userId: string, lang: string, d: { whatsapp: string; country: string; org: Record<string, string | null> }) {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const ua = h.get("user-agent") ?? null;
  const locale = lang === "es" ? "es" : "pt-BR";
  await asUser(userId, (q) => q`select complete_professional_signup(${d.whatsapp}, ${d.country}, ${locale},
    ${[...PRO_CONSENTS]}::text[], ${CONSENT_VERSION}, ${JSON.stringify(d.org)}::jsonb, ${ip}, ${ua})`);
}

const proError = (e: unknown) => {
  const m = String((e as Error).message);
  if (/already completed/.test(m)) return "done";
  if (/not allowed/.test(m)) return "notAllowed";
  if (/website/.test(m)) return "website";
  if (/consents/.test(m)) return "consents";
  if (/invalid kind/.test(m)) return "kind";
  if (/organization required|country/.test(m)) return "required";
  return "generic";
};

/** Cadastro profissional: conta (Neon Auth) + organização "pendente" (banco). */
export async function proSignUp(lang: string, _prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const auth = ready();
  if (!auth) return { error: "backend" };
  const fullName = str(fd, "full_name");
  const email = lower(fd, "email");
  const password = String(fd.get("password") ?? "");
  if (fullName.length < 3 || !email || !password) return { error: "required" };
  if (!isEmail(email)) return { error: "email" };
  if (password.length < 8 || password.length > 128) return { error: "password" };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "mismatch" };
  const details = proDetails(fd);
  if ("error" in details) return { error: details.error };

  const l = safeLang(lang);
  if (!(await signupAllowed())) return { error: "tooMany" };
  const { data, error } = await auth.signUp.email({ email, password, name: fullName });
  if (error || !data?.user?.id) {
    if (/exist/i.test(code(error)) || status(error) === 422) return { error: "exists" };
    return { error: status(error) === 429 ? "tooMany" : "generic" };
  }
  try {
    await completeProAs(data.user.id, l, details);
  } catch {
    /* segue: depois de confirmar o e-mail, a pessoa conclui em /profissional/cadastro */
  }
  await sendCode(email, "email-verification");
  redirect(`/${l}/entrar/verificar`);
}

/** Conclusão do cadastro profissional para uma conta já criada (sem atletas). */
export async function completeProSignup(lang: string, _prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  if (!ready()) return { error: "backend" };
  const user = await currentUser();
  const l = safeLang(lang);
  if (!user) redirect(`/${l}/entrar`);
  const details = proDetails(fd);
  if ("error" in details) return { error: details.error };
  try {
    await completeProAs(user.id, l, details);
  } catch (e) {
    const k = proError(e);
    if (k !== "done") return { error: k };
  }
  redirect(`/${l}/portal`);
}

// ---------------------------------------------------------------- convite para a equipe (B2)
function joinDetails(fd: FormData) {
  const whatsapp = cleanPhone(str(fd, "whatsapp"));
  const country = (countries as readonly string[]).includes(str(fd, "country")) ? str(fd, "country") : null;
  if (!whatsapp || !country) return { error: "required" } as const;
  if (!/^\+?\d{10,15}$/.test(whatsapp)) return { error: "whatsapp" } as const;
  if (!PRO_CONSENTS.every((c) => fd.get(c) === "on")) return { error: "consents" } as const;
  return { whatsapp, country } as const;
}

async function joinAs(userId: string, lang: string, token: string, d: { whatsapp: string; country: string }) {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const ua = h.get("user-agent") ?? null;
  await asUser(userId, (q) => q`select complete_professional_join(${d.whatsapp}, ${d.country}, ${lang === "es" ? "es" : "pt-BR"},
    ${[...PRO_CONSENTS]}::text[], ${CONSENT_VERSION}, ${token}, ${ip}, ${ua})`);
}
const joinError = (e: unknown) => {
  const m = String((e as Error).message);
  return /invalid invite/.test(m) ? "invite" : /team full/.test(m) ? "full" : /not allowed/.test(m) ? "notAllowed" : /already completed/.test(m) ? "done" : "generic";
};

/** Conta nova pelo convite: cria o login e entra na equipe (o banco confere o convite). */
export async function proJoinSignUp(lang: string, token: string, _prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const auth = ready();
  if (!auth) return { error: "backend" };
  const fullName = str(fd, "full_name");
  const email = lower(fd, "email");
  const password = String(fd.get("password") ?? "");
  if (fullName.length < 3 || !email || !password) return { error: "required" };
  if (!isEmail(email)) return { error: "email" };
  if (password.length < 8 || password.length > 128) return { error: "password" };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "mismatch" };
  const details = joinDetails(fd);
  if ("error" in details) return { error: details.error };
  const l = safeLang(lang);
  if (!(await signupAllowed())) return { error: "tooMany" };
  const { data, error } = await auth.signUp.email({ email, password, name: fullName });
  if (error || !data?.user?.id) {
    if (/exist/i.test(code(error)) || status(error) === 422) return { error: "exists" };
    return { error: status(error) === 429 ? "tooMany" : "generic" };
  }
  try {
    await joinAs(data.user.id, l, token, details);
  } catch {
    /* depois de confirmar o e-mail, a pessoa conclui pelo mesmo link */
  }
  await sendCode(email, "email-verification");
  redirect(`/${l}/entrar/verificar`);
}

/** Conta já criada (sem cadastro concluído) entra na equipe pelo convite. */
export async function completeProJoin(lang: string, token: string, _prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  if (!ready()) return { error: "backend" };
  const user = await currentUser();
  const l = safeLang(lang);
  if (!user) redirect(`/${l}/entrar`);
  const details = joinDetails(fd);
  if ("error" in details) return { error: details.error };
  try {
    await joinAs(user.id, l, token, details);
  } catch (e) {
    const k = joinError(e);
    if (k !== "done") return { error: k };
  }
  redirect(`/${l}/portal`);
}
