import "server-only";
import { cookies, headers } from "next/headers";
import { asService } from "@/lib/db";
import { authEnv } from "./server";
import { DEVICE_COOKIE, DEVICE_MAX_AGE, addDeviceMark, clientIp, exactIp, isTrustedDevice, makeLimiter, type LimitStore, type Limiter } from "./limits";

/**
 * Limite de tentativas ligado ao banco (funções auth_limit_* de 0013, só pelo servidor).
 * As regras estão em ./limits.ts. A chave das marcas (HMAC) deriva de
 * NEON_AUTH_COOKIE_SECRET: trocá-la zera os contadores e os aparelhos confiáveis.
 */
type Res = { blocked: boolean; retry_after?: number | null };
/**
 * Espera máxima por consulta: o banco grátis "acorda" em até ~2 s depois de 5 min parado;
 * acima disso a consulta é tratada como falha passageira (ver classifyFailure em ./limits).
 */
const TIMEOUT_MS = 2500;
const one = (rows: { r: Res }[]) => {
  if (!rows[0]?.r) throw new Error("resposta vazia do limitador");
  return rows[0].r;
};
const store: LimitStore = {
  async check(keys) {
    return one(await asService<{ r: Res }>((q) => q`select auth_limit_check(${keys}::text[]) as r`, { timeoutMs: TIMEOUT_MS }));
  },
  async hit(key, scope, rule) {
    return one(await asService<{ r: Res }>((q) => q`select auth_limit_hit(${key}, ${scope}, ${rule.max}, ${rule.window}, ${rule.block}, ${Boolean(rule.escalate)}) as r`, { timeoutMs: TIMEOUT_MS }));
  },
  async clear(keys) {
    await asService((q) => q`select auth_limit_clear(${keys}::text[])`, { timeoutMs: TIMEOUT_MS });
  },
};

/** Homologação e produção rodam na Vercel, que sempre informa o IP do cliente. */
const deployed = () => process.env.VP_ENV === "homolog" || process.env.VP_ENV === "production";

let limiter: Limiter | null = null;
function secret() {
  return authEnv()?.secret ?? null;
}
/** `null` sem backend configurado (as ações já respondem "backend"). */
export function getLimiter() {
  const s = secret();
  if (!s) return null;
  limiter ??= makeLimiter(store, s, { requireIp: deployed() });
  return limiter;
}

export async function requestIp() {
  const h = await headers();
  return clientIp((n) => h.get(n));
}

/** IP exato para os registros de consentimento (ou null). */
export async function consentIp() {
  const h = await headers();
  return exactIp((n) => h.get(n));
}

export async function trustedDevice(email: string) {
  const s = secret();
  if (!s) return false;
  return isTrustedDevice(s, email, (await cookies()).get(DEVICE_COOKIE)?.value);
}

/** Depois de entrar com a senha certa: marca este aparelho para esta conta. */
export async function rememberDevice(email: string) {
  const s = secret();
  if (!s) return;
  const jar = await cookies();
  jar.set(DEVICE_COOKIE, addDeviceMark(s, email, jar.get(DEVICE_COOKIE)?.value), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: DEVICE_MAX_AGE,
  });
}
