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
};

export type FlowError = "tooMany" | "wait" | "unavailable" | "invalid" | "code";
const refused = (d: Decision): FlowError | null => (d.ok ? null : d.reason === "unavailable" ? "unavailable" : d.reason === "wait" ? "wait" : "tooMany");

/** Envia um código (qualquer tipo), respeitando a espera por e-mail e os limites. */
export async function sendCodeFlow(limiter: Limiter | null, auth: AuthPort, w: { email: string; ip: string }, type: Parameters<AuthPort["sendCode"]>[1]): Promise<FlowError | null> {
  if (limiter) {
    const no = refused(await limiter.otpSend(w, type));
    if (no) return no;
  }
  return (await auth.sendCode(w.email, type)) === "rate_limited" ? "tooMany" : null;
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
): Promise<PasswordResult> {
  const start = limiter ? await limiter.signinStart(w) : null;
  if (start && !start.ok) return { kind: "error", error: refused(start)! };
  if (start?.mode === "code") return { kind: "challenge", sent: await sendCodeFlow(limiter, auth, w, "sign-in") };

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

/** Entrar com o código enviado ao e-mail (login protegido). */
export async function codeSignIn(limiter: Limiter | null, auth: AuthPort, w: { email: string; code: string; ip: string }): Promise<{ kind: "error"; error: FlowError } | { kind: "ok" }> {
  if (limiter) {
    const no = refused(await limiter.otpVerifyAllowed(w));
    if (no) return { kind: "error", error: no };
  }
  const r = await auth.signInCode(w.email, w.code);
  if (!r.ok) return { kind: "error", error: r.kind === "rate_limited" ? "tooMany" : "code" };
  if (limiter) await limiter.codeSigninOk(w);
  return { kind: "ok" };
}
