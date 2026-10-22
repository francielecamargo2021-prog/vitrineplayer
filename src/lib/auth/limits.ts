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
 * Se o banco falhar, a decisão depende do tipo de falha (ver classifyFailure).
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

/**
 * `limit`: a regra de tentativas barrou. `unavailable`: o limitador não pôde decidir com
 * segurança (configuração errada, IP ausente em ambiente publicado ou falha que não se
 * sabe classificar num fluxo sensível) e o pedido é recusado sem consultar o Neon Auth.
 */
export type Decision = { ok: true } | { ok: false; reason: "limit" | "unavailable"; retryAfter: number };

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

/** Valor que normalizeIp devolve quando não há IP utilizável. */
export const NO_IP = "desconhecido";

export function clientIp(get: (name: string) => string | null) {
  return normalizeIp(get("x-real-ip") || get("x-forwarded-for"));
}

/** IP exato (sem agrupar o IPv6), só se for um endereço válido. Usado nos registros de consentimento. */
export function exactIp(get: (name: string) => string | null) {
  const ip = (get("x-real-ip") || get("x-forwarded-for") || "").split(",")[0].trim().replace(/^\[|\]$/g, "");
  return isIP(ip) ? ip : null;
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
const deny = (r: { retry_after?: number | null }): Decision => ({ ok: false, reason: "limit", retryAfter: Math.max(1, Number(r.retry_after) || 60) });
const unavailable: Decision = { ok: false, reason: "unavailable", retryAfter: 60 };

// ---------------------------------------------------------------- falhas do limitador
/**
 * Como tratar uma falha ao consultar o banco:
 *  * `config`: o ambiente está errado (função ou tabela ausente, permissão negada, senha
 *    do banco recusada, URL ausente, erro de programação). Não passa: liberar esconderia
 *    o problema e deixaria o login sem proteção por tempo indeterminado.
 *  * `transient`: rede, tempo esgotado, banco reiniciando ou sobrecarregado. Passa, com
 *    registro: o Neon Auth usa o mesmo banco, então uma queda real já impede o login.
 *  * `unknown`: o resto. Passa só no login; nos fluxos de código e cadastro, não.
 * Os erros chegam do driver @neondatabase/serverless como NeonDbError: com `code`
 * (SQLSTATE) quando o Postgres respondeu; sem `code` e com `sourceError` quando a
 * requisição nem chegou; "Server error (HTTP status N)" quando o proxy respondeu com erro.
 */
export type FailureKind = "config" | "transient" | "unknown";
export class LimiterConfigError extends Error {
  override name = "LimiterConfigError";
}

const CONFIG_SQLSTATES = new Set([
  "42883", // função inexistente (migration não aplicada)
  "42P01", // tabela inexistente
  "42703", // coluna inexistente
  "42501", // permissão negada
  "28P01", "28000", // credencial do banco recusada
  "3D000", "3F000", // banco ou schema inexistente
  "P0001", // raise da própria função ("not allowed", "invalid limit")
  "23514", "22P02", // chave ou parâmetro inválido (erro do app)
]);
const TRANSIENT_SQLSTATE = /^(08|53|57P0[1-3]|40001|40P01)/;

export function classifyFailure(e: unknown): FailureKind {
  if (e instanceof LimiterConfigError) return "config";
  if (!e || typeof e !== "object") return "unknown";
  const err = e as { name?: unknown; code?: unknown; message?: unknown; sourceError?: unknown };
  const name = typeof err.name === "string" ? err.name : "";
  const message = typeof err.message === "string" ? err.message : "";
  const code = typeof err.code === "string" && /^[0-9A-Z]{5}$/.test(err.code) ? err.code : "";
  if (code) return CONFIG_SQLSTATES.has(code) ? "config" : TRANSIENT_SQLSTATE.test(code) ? "transient" : "unknown";
  if (name === "TimeoutError" || name === "AbortError") return "transient";
  if (err.sourceError) return "transient"; // a requisição ao banco não chegou (rede, TLS, tempo esgotado)
  const http = /HTTP status (\d{3})/.exec(message);
  if (http) {
    const status = Number(http[1]);
    if (status === 401 || status === 403) return "config";
    if (status === 429 || status >= 500) return "transient";
    return "unknown";
  }
  if (/DATABASE_URL não configurada/.test(message)) return "config";
  if (name === "TypeError" || name === "ReferenceError" || name === "RangeError") return "config"; // erro de programação
  return "unknown";
}

/** Fluxo protegido: define quem passa quando a falha é `unknown`. */
export type Flow = "signin" | "signup" | "otp_send" | "otp_verify";
const OPEN_ON_UNKNOWN: Record<Flow, boolean> = { signin: true, signup: false, otp_send: false, otp_verify: false };

/** Registro sem dados pessoais: só o fluxo, a etapa, o tipo e o código do erro e a decisão. */
export type LimiterEvent = { flow: Flow; step: "check" | "record" | "clear"; kind: FailureKind; decision: "liberado" | "recusado" | "sem efeito"; error: string; code?: string };
const describe = (e: unknown) => {
  const err = (e ?? {}) as { name?: unknown; code?: unknown };
  return { error: typeof err.name === "string" ? err.name : typeof e, code: typeof err.code === "string" ? err.code : undefined };
};
const defaultLog = (ev: LimiterEvent) => console.error("[limite de tentativas]", JSON.stringify(ev));

export type Who = { email: string; ip: string; trusted?: boolean };
export type LimiterOptions = {
  log?: (ev: LimiterEvent) => void;
  /** Ambiente publicado: sem IP da plataforma, recusa (é erro de configuração, não "desconhecido"). */
  requireIp?: boolean;
};

export function makeLimiter(store: LimitStore, secret: string, opts: LimiterOptions = {}) {
  const log = opts.log ?? defaultLog;
  const k = (scope: Scope, value: string) => deriveKey(secret, scope, value);
  const keys = {
    pair: (w: Who) => k("signin_pair", `${w.email}\n${w.ip}`),
    ip: (scope: Scope, w: Pick<Who, "ip">) => k(scope, w.ip),
    email: (scope: Scope, w: Pick<Who, "email">) => k(scope, w.email),
  };

  /** Consulta antes da ação. Falha: passa ou recusa conforme o tipo e o fluxo. */
  async function allow(flow: Flow, ip: string, run: () => Promise<{ blocked: boolean; retry_after?: number | null }>): Promise<Decision> {
    try {
      if (opts.requireIp && ip === NO_IP) throw new LimiterConfigError("IP do cliente ausente em ambiente publicado");
      const r = await run();
      return r.blocked ? deny(r) : { ok: true };
    } catch (e) {
      const kind = classifyFailure(e);
      const pass = kind === "transient" || (kind === "unknown" && OPEN_ON_UNKNOWN[flow]);
      log({ flow, step: "check", kind, decision: pass ? "liberado" : "recusado", ...describe(e) });
      return pass ? { ok: true } : unavailable;
    }
  }
  /** Registro depois da ação: a resposta à pessoa já foi decidida; a falha só é registrada. */
  async function record(flow: Flow, step: "record" | "clear", run: () => Promise<unknown>) {
    try {
      await run();
    } catch (e) {
      log({ flow, step, kind: classifyFailure(e), decision: "sem efeito", ...describe(e) });
    }
  }
  const hit = (flow: Flow, key: string, scope: Scope) => record(flow, "record", () => store.hit(key, scope, RULES[scope]));

  return {
    /** Antes de conferir a senha. */
    async signinAllowed(w: Who): Promise<Decision> {
      const list = [keys.pair(w), keys.ip("signin_ip", w)];
      if (!w.trusted) list.push(keys.email("signin_email", w));
      return allow("signin", w.ip, () => store.check(list));
    },
    /** Senha errada (ou conta inexistente: mesma contagem, mesma resposta). */
    async signinFailed(w: Who) {
      // em paralelo: com o banco travado, a espera total fica limitada a um único tempo máximo
      await Promise.all([
        hit("signin", keys.pair(w), "signin_pair"),
        hit("signin", keys.ip("signin_ip", w), "signin_ip"),
        w.trusted ? null : hit("signin", keys.email("signin_email", w), "signin_email"),
      ]);
    },
    /** Senha certa: zera e-mail + IP e o contador do e-mail (o do IP continua). */
    async signinSucceeded(w: Who) {
      await record("signin", "clear", () => store.clear([keys.pair(w), keys.email("signin_email", w)]));
    },
    /** Envio de código por e-mail: conta o envio; acima do limite, não envia. */
    async otpSend(w: Pick<Who, "email" | "ip">): Promise<Decision> {
      const em = keys.email("otp_send_email", w), ip = keys.ip("otp_send_ip", w);
      const d = await allow("otp_send", w.ip, () => store.check([em, ip]));
      if (!d.ok) return d;
      await Promise.all([hit("otp_send", em, "otp_send_email"), hit("otp_send", ip, "otp_send_ip")]);
      return d;
    },
    /** Antes de conferir um código de 6 dígitos (verificação ou troca de senha). */
    async otpVerifyAllowed(w: Pick<Who, "email" | "ip">): Promise<Decision> {
      return allow("otp_verify", w.ip, () => store.check([keys.email("otp_verify_email", w), keys.ip("otp_verify_ip", w)]));
    },
    async otpVerifyFailed(w: Pick<Who, "email" | "ip">) {
      await Promise.all([hit("otp_verify", keys.email("otp_verify_email", w), "otp_verify_email"), hit("otp_verify", keys.ip("otp_verify_ip", w), "otp_verify_ip")]);
    },
    async otpVerifySucceeded(w: Pick<Who, "email">) {
      await record("otp_verify", "clear", () => store.clear([keys.email("otp_verify_email", w)]));
    },
    /** Criação de conta: conta cada tentativa por IP. */
    async signup(w: Pick<Who, "ip">): Promise<Decision> {
      const key = keys.ip("signup_ip", w);
      const d = await allow("signup", w.ip, () => store.check([key]));
      if (!d.ok) return d;
      await hit("signup", key, "signup_ip");
      return d;
    },
  };
}
export type Limiter = ReturnType<typeof makeLimiter>;
