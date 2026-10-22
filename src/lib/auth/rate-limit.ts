import "server-only";
import { cookies, headers } from "next/headers";
import { asService } from "@/lib/db";
import { authEnv } from "./server";
import { LIMIT_SQL } from "./limit-sql";
import { DEVICE_COOKIE, DEVICE_MAX_AGE, clientIp, exactIp, isDeviceToken, makeLimiter, newDeviceToken, type LimitStore, type Limiter } from "./limits";

/**
 * Proteção do login ligada ao banco (funções auth_* de 0013/0014, só pelo servidor).
 * As regras estão em ./limits.ts e o fluxo em ./signin-flow.ts. As chaves (HMAC) derivam
 * de NEON_AUTH_COOKIE_SECRET: trocá-lo zera contadores e proteções (não os aparelhos,
 * que são tokens aleatórios, mas as chaves de conta mudam e eles deixam de casar).
 */
/**
 * Espera máxima por consulta: o banco grátis "acorda" em até ~2 s depois de 5 min parado;
 * acima disso a consulta é tratada como falha passageira (ver classifyFailure em ./limits).
 */
const TIMEOUT_MS = 2500;
const run = <T = Record<string, unknown>>(text: string, params: unknown[]) =>
  asService<T>((q) => q.query(text, params), { timeoutMs: TIMEOUT_MS });
const first = <T>(rows: { r: T }[]) => {
  if (!rows[0] || rows[0].r === undefined || rows[0].r === null) throw new Error("resposta vazia do limitador");
  return rows[0].r;
};

const store: LimitStore = {
  consume: async (items) => first(await run<{ r: { blocked: boolean; retry_after?: number } }>(LIMIT_SQL.consume, [JSON.stringify(items)])),
  refund: async (keys) => void (await run(LIMIT_SQL.refund, [keys])),
  clear: async (keys) => void (await run(LIMIT_SQL.clear, [keys])),
  guardBegin: async (account, trusted) => first(await run<{ r: "password" | "code" }>(LIMIT_SQL.guardBegin, [account, trusted])),
  guardSuccess: async (account) => void (await run(LIMIT_SQL.guardSuccess, [account])),
  deviceCheck: async (account, hash) => first(await run<{ r: boolean }>(LIMIT_SQL.deviceCheck, [account, hash])),
  deviceRegister: async (account, hash, days) => void (await run(LIMIT_SQL.deviceRegister, [account, hash, days])),
  deviceRevokeAll: async (account) => void (await run(LIMIT_SQL.deviceRevokeAll, [account])),
  sendCooldown: async (key) => first(await run<{ r: { allowed: boolean; retry_after?: number } }>(LIMIT_SQL.sendCooldown, [key])),
};

/** Homologação e produção rodam na Vercel, que sempre informa o IP do cliente. */
const deployed = () => process.env.VP_ENV === "homolog" || process.env.VP_ENV === "production";

let limiter: Limiter | null = null;
/** `null` sem backend configurado (as ações já respondem "backend"). */
export function getLimiter() {
  const s = authEnv()?.secret;
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

/** Token deste aparelho (se houver um válido no cookie). */
export async function deviceToken() {
  const v = (await cookies()).get(DEVICE_COOKIE)?.value;
  return isDeviceToken(v) ? v : null;
}

/** Depois de um login completo: este aparelho passa a ser reconhecido para a conta. */
export async function rememberDevice(email: string) {
  const l = getLimiter();
  if (!l) return;
  const jar = await cookies();
  const current = jar.get(DEVICE_COOKIE)?.value;
  const token = isDeviceToken(current) ? current : newDeviceToken();
  await l.rememberDevice(email, token);
  jar.set(DEVICE_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: DEVICE_MAX_AGE,
  });
}
