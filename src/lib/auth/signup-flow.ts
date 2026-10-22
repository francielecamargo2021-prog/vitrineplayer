import { padTo, type Timing } from "./signin-flow.ts";

/**
 * Criação de conta sem revelar se o e-mail já existe (E3), sem Next.js e sem rede: o Neon Auth
 * chega por `SignupPort`. Nos dois casos a pessoa vai para a MESMA tela de código (com a dica
 * "já tem conta? entre ou recupere a senha"), no MESMO tempo mínimo, e um código de confirmação
 * é pedido (para um e-mail já confirmado o Neon Auth não envia nada).
 */
export type SignupPort = {
  signUp(a: { email: string; password: string; name: string }): Promise<{ ok: true; userId: string } | { ok: false; kind: "exists" | "rate_limited" | "other" }>;
  sendVerification(email: string): Promise<unknown>;
};

export const SIGNUP_TIMING: Timing = { floorMs: 1800, jitterMs: 400, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

export async function signupFlow(
  port: SignupPort, a: { email: string; password: string; name: string; lang: string },
  complete: (userId: string) => Promise<void>, timing: Timing = SIGNUP_TIMING,
): Promise<{ kind: "verify"; to: string } | { kind: "error"; error: "tooMany" | "generic" }> {
  const started = Date.now();
  const r = await port.signUp(a);
  if (!r.ok && r.kind !== "exists") return { kind: "error", error: r.kind === "rate_limited" ? "tooMany" : "generic" };
  if (r.ok) {
    try {
      await complete(r.userId);
    } catch {
      /* segue: o painel ou o portal encaminham para "concluir cadastro" */
    }
  }
  await port.sendVerification(a.email).catch(() => {});
  await padTo(timing, started);
  return { kind: "verify", to: `/${a.lang}/entrar/verificar?email=${encodeURIComponent(a.email)}` };
}
