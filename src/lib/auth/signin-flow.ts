import type { Decision, Limiter } from "./limits.ts";

/**
 * Fluxo de entrada (senha e código por e-mail), sem Next.js e sem rede: as chamadas ao
 * Neon Auth chegam por `AuthPort`. Assim o fluxo inteiro é testado com o banco local,
 * inclusive sob pedidos simultâneos (db/tests/local/simultaneidade.mjs).
 */
export type AuthPort = {
  signInPassword(email: string, password: string): Promise<{ ok: true; emailVerified: boolean } | { ok: false; kind: "invalid" | "not_verified" | "rate_limited" }>;
  sendCode(email: string, type: "sign-in" | "email-verification" | "forget-password"): Promise<"ok" | "rate_limited">;
  signInCode(email: string, otp: string): Promise<{ ok: true } | { ok: false; kind: "code" | "rate_limited" }>;
  /** A conta já existe? (consulta no servidor; nunca chega à tela) */
  accountExists(email: string): Promise<boolean>;
};

/**
 * Tempo mínimo das respostas que dependem de a conta existir: quem pede um código para um
 * e-mail sem conta espera o mesmo que quem recebe o envio (não dá para descobrir pelo tempo).
 */
export type Timing = { floorMs: number; jitterMs: number; sleep: (ms: number) => Promise<void> };
export const DEFAULT_TIMING: Timing = { floorMs: 900, jitterMs: 250, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
async function padTo(t: Timing, started: number) {
  const target = t.floorMs + Math.random() * t.jitterMs;
  const left = target - (Date.now() - started);
  if (left > 0) await t.sleep(left);
}

export type FlowError = "tooMany" | "wait" | "unavailable" | "invalid" | "code";
const refused = (d: Decision): FlowError | null => (d.ok ? null : d.reason === "unavailable" ? "unavailable" : d.reason === "wait" ? "wait" : "tooMany");

/**
 * Envia um código, respeitando a espera por e-mail e os limites.
 * Código de ENTRADA ("sign-in"): só para conta que já existe. Para e-mail sem conta nada é
 * enviado (o Neon Auth criaria a conta ao entrar com o código), mas a resposta e o tempo
 * são os mesmos. Se não der para confirmar a conta (banco indisponível), não envia.
 */
export async function sendCodeFlow(
  limiter: Limiter | null, auth: AuthPort, w: { email: string; ip: string }, type: Parameters<AuthPort["sendCode"]>[1],
  timing: Timing = DEFAULT_TIMING,
): Promise<FlowError | null> {
  if (limiter) {
    const no = refused(await limiter.otpSend(w, type));
    if (no) return no;
  }
  if (type !== "sign-in") return (await auth.sendCode(w.email, type)) === "rate_limited" ? "tooMany" : null;
  const started = Date.now();
  let exists: boolean;
  try {
    exists = await auth.accountExists(w.email);
  } catch {
    return "unavailable";
  }
  const r = exists ? await auth.sendCode(w.email, type) : "ok";
  await padTo(timing, started);
  return r === "rate_limited" ? "tooMany" : null;
}

export type PasswordResult =
  | { kind: "error"; error: FlowError }
  /** A conta está protegida: a senha não foi conferida; um código foi (ou não) enviado. */
  | { kind: "challenge"; sent: FlowError | null }
  | { kind: "not_verified" }
  | { kind: "ok"; emailVerified: boolean };

/** Entrar com senha. Com a conta protegida, NÃO confere a senha: oferece o código por e-mail. */
export async function passwordSignIn(
  limiter: Limiter | null, auth: AuthPort,
  w: { email: string; password: string; ip: string; deviceToken?: string | null },
  timing: Timing = DEFAULT_TIMING,
): Promise<PasswordResult> {
  const start = limiter ? await limiter.signinStart(w) : null;
  if (start && !start.ok) return { kind: "error", error: refused(start)! };
  if (start?.mode === "code") return { kind: "challenge", sent: await sendCodeFlow(limiter, auth, w, "sign-in", timing) };

  const r = await auth.signInPassword(w.email, w.password);
  if (!r.ok) {
    if (r.kind === "rate_limited") return { kind: "error", error: "tooMany" };
    if (r.kind === "not_verified") {
      // a senha estava certa (o Neon só acusa e-mail não confirmado depois de conferi-la)
      if (start?.ok && limiter) await limiter.signinPasswordOk(start.ticket);
      return { kind: "not_verified" };
    }
    return { kind: "error", error: "invalid" }; // a tentativa já foi contada antes
  }
  if (start?.ok && limiter) await limiter.signinPasswordOk(start.ticket);
  return { kind: "ok", emailVerified: r.emailVerified };
}

/**
 * Entrar com o código enviado ao e-mail (login protegido). Só para conta existente: para
 * e-mail sem conta, a resposta é "código inválido" e o Neon Auth nem é chamado (assim um
 * código obtido por fora não cria conta por este caminho).
 */
export async function codeSignIn(
  limiter: Limiter | null, auth: AuthPort, w: { email: string; code: string; ip: string },
  timing: Timing = DEFAULT_TIMING,
): Promise<{ kind: "error"; error: FlowError } | { kind: "ok" }> {
  if (limiter) {
    const no = refused(await limiter.otpVerifyAllowed(w));
    if (no) return { kind: "error", error: no };
  }
  const started = Date.now();
  let exists: boolean;
  try {
    exists = await auth.accountExists(w.email);
  } catch {
    return { kind: "error", error: "unavailable" };
  }
  if (!exists) {
    await padTo({ ...timing, floorMs: Math.min(timing.floorMs, 400) }, started);
    return { kind: "error", error: "code" };
  }
  const r = await auth.signInCode(w.email, w.code);
  if (!r.ok) return { kind: "error", error: r.kind === "rate_limited" ? "tooMany" : "code" };
  if (limiter) await limiter.codeSigninOk(w);
  return { kind: "ok" };
}
