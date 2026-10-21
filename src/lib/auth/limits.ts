import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

/**
 * Regras do limite de tentativas (login, códigos por e-mail e cadastro).
 *
 * Os contadores ficam no banco (migration 0013): valem para todas as instâncias
 * serverless ao mesmo tempo. Este módulo só decide — não fala com o banco nem com
 * cookies — para poder ser testado sem rede (npm run test:auth).
 *
 * Contra força bruta:
 *  * e-mail + IP: 5 senhas erradas em 15 min → 15 min de espera (dobra a cada reincidência, até 2 h);
 *  * IP: 20 erros em 15 min (várias contas) → 30 min (dobra até 4 h).
 * Contra o bloqueio abusivo da conta de outra pessoa:
 *  * o limite por e-mail (10 erros/h vindos de IPs diferentes) NÃO cresce e NÃO vale para
 *    o aparelho onde a pessoa já entrou com sucesso (cookie assinado pelo servidor);
 *  * acertar a senha zera o contador de e-mail + IP e o de e-mail.
 * As mensagens são sempre as mesmas ("muitas tentativas"), exista a conta ou não.
 */
export type Rule = { max: number; window: number; block: number; escalate?: boolean };

export const RULES = {
  signin_pair: { max: 5, window: 15 * 60, block: 15 * 60, escalate: true },
  signin_ip: { max: 20, window: 15 * 60, block: 30 * 60, escalate: true },
  signin_email: { max: 10, window: 60 * 60, block: 60 * 60 },
  otp_send_email: { max: 5, window: 60 * 60, block: 60 * 60 },
  otp_send_ip: { max: 20, window: 60 * 60, block: 60 * 60, escalate: true },
  otp_verify_email: { max: 5, window: 15 * 60, block: 15 * 60 },
  otp_verify_ip: { max: 30, window: 15 * 60, block: 30 * 60, escalate: true },
  signup_ip: { max: 10, window: 60 * 60, block: 60 * 60, escalate: true },
} satisfies Record<string, Rule>;
export type Scope = keyof typeof RULES;

export type Decision = { ok: true } | { ok: false; retryAfter: number };

/** Acesso aos contadores (no app: funções auth_limit_* do banco). */
export interface LimitStore {
  check(keys: string[]): Promise<{ blocked: boolean; retry_after?: number | null }>;
  hit(key: string, scope: Scope, rule: Rule): Promise<{ blocked: boolean; retry_after?: number | null }>;
  clear(keys: string[]): Promise<void>;
}

// ---------------------------------------------------------------- chaves (nunca e-mail/IP em texto)
const subkey = (secret: string) => createHmac("sha256", secret).update("vp:limite:v1").digest();

export function deriveKey(secret: string, scope: string, value: string) {
  return createHmac("sha256", subkey(secret)).update(`${scope}\n${value}`).digest("hex");
}

/**
 * IP do cliente. Na Vercel, x-real-ip e x-forwarded-for são preenchidos pela própria
 * plataforma (o valor enviado pelo navegador é substituído). IPv6 conta pelo bloco /64,
 * para que trocar o fim do endereço não zere o limite.
 */
export function normalizeIp(raw: string | null | undefined) {
  const ip = (raw ?? "").split(",")[0].trim().replace(/^\[|\]$/g, "");
  const kind = isIP(ip);
  if (kind === 4) return ip;
  if (kind !== 6) return "desconhecido";
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (v4) return v4[1];
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t] : h;
  return `${full.slice(0, 4).map((p) => p.padStart(4, "0")).join(":")}::/64`;
}

export function clientIp(get: (name: string) => string | null) {
  return normalizeIp(get("x-real-ip") || get("x-forwarded-for"));
}

// ---------------------------------------------------------------- aparelho confiável
/** Cookie que marca "neste aparelho a pessoa já entrou". Guarda só marcas HMAC (até 5 contas). */
export const DEVICE_COOKIE = "vp_dev";
export const DEVICE_MAX_AGE = 90 * 24 * 60 * 60;

export function deviceMark(secret: string, email: string) {
  return createHmac("sha256", subkey(secret)).update(`device\n${email}`).digest("base64url").slice(0, 32);
}
export function isTrustedDevice(secret: string, email: string, cookie: string | null | undefined) {
  const want = Buffer.from(deviceMark(secret, email));
  return (cookie ?? "").split(".").some((m) => {
    const got = Buffer.from(m);
    return got.length === want.length && timingSafeEqual(got, want);
  });
}
export function addDeviceMark(secret: string, email: string, cookie: string | null | undefined) {
  const mark = deviceMark(secret, email);
  const rest = (cookie ?? "").split(".").filter((m) => /^[A-Za-z0-9_-]{32}$/.test(m) && m !== mark);
  return [mark, ...rest].slice(0, 5).join(".");
}

// ---------------------------------------------------------------- decisões
const deny = (r: { retry_after?: number | null }): Decision => ({ ok: false, retryAfter: Math.max(1, Number(r.retry_after) || 60) });

/**
 * Falha no banco não pode derrubar o login de todo mundo: registra o erro e libera.
 * (Sem banco o app já não funciona; o Neon Auth tem a própria proteção.)
 */
async function safe<T>(fn: () => Promise<T>, fallback: T, log: (e: unknown) => void): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    log(e);
    return fallback;
  }
}

export type Who = { email: string; ip: string; trusted?: boolean };

export function makeLimiter(store: LimitStore, secret: string, log: (e: unknown) => void = (e) => console.error("[limite de tentativas]", e)) {
  const k = (scope: Scope, value: string) => deriveKey(secret, scope, value);
  const keys = {
    pair: (w: Who) => k("signin_pair", `${w.email}\n${w.ip}`),
    ip: (scope: Scope, w: Pick<Who, "ip">) => k(scope, w.ip),
    email: (scope: Scope, w: Pick<Who, "email">) => k(scope, w.email),
  };
  const check = (list: string[]) => safe(() => store.check(list), { blocked: false }, log);
  const hit = (key: string, scope: Scope) => safe(() => store.hit(key, scope, RULES[scope]), { blocked: false }, log);

  return {
    /** Antes de conferir a senha. */
    async signinAllowed(w: Who): Promise<Decision> {
      const list = [keys.pair(w), keys.ip("signin_ip", w)];
      if (!w.trusted) list.push(keys.email("signin_email", w));
      const r = await check(list);
      return r.blocked ? deny(r) : { ok: true };
    },
    /** Senha errada (ou conta inexistente: mesma contagem, mesma resposta). */
    async signinFailed(w: Who) {
      await hit(keys.pair(w), "signin_pair");
      await hit(keys.ip("signin_ip", w), "signin_ip");
      if (!w.trusted) await hit(keys.email("signin_email", w), "signin_email");
    },
    /** Senha certa: zera e-mail + IP e o contador do e-mail (o do IP continua). */
    async signinSucceeded(w: Who) {
      await safe(() => store.clear([keys.pair(w), keys.email("signin_email", w)]), undefined, log);
    },
    /** Envio de código por e-mail: conta o envio; acima do limite, não envia. */
    async otpSend(w: Pick<Who, "email" | "ip">): Promise<Decision> {
      const em = keys.email("otp_send_email", w), ip = keys.ip("otp_send_ip", w);
      const r = await check([em, ip]);
      if (r.blocked) return deny(r);
      await hit(em, "otp_send_email");
      await hit(ip, "otp_send_ip");
      return { ok: true };
    },
    /** Antes de conferir um código de 6 dígitos (verificação ou troca de senha). */
    async otpVerifyAllowed(w: Pick<Who, "email" | "ip">): Promise<Decision> {
      const r = await check([keys.email("otp_verify_email", w), keys.ip("otp_verify_ip", w)]);
      return r.blocked ? deny(r) : { ok: true };
    },
    async otpVerifyFailed(w: Pick<Who, "email" | "ip">) {
      await hit(keys.email("otp_verify_email", w), "otp_verify_email");
      await hit(keys.ip("otp_verify_ip", w), "otp_verify_ip");
    },
    async otpVerifySucceeded(w: Pick<Who, "email">) {
      await safe(() => store.clear([keys.email("otp_verify_email", w)]), undefined, log);
    },
    /** Criação de conta: conta cada tentativa por IP. */
    async signup(w: Pick<Who, "ip">): Promise<Decision> {
      const key = keys.ip("signup_ip", w);
      const r = await check([key]);
      if (r.blocked) return deny(r);
      await hit(key, "signup_ip");
      return { ok: true };
    },
  };
}
export type Limiter = ReturnType<typeof makeLimiter>;
