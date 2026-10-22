import { createHash, createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";

/**
 * Proteção do login, dos códigos por e-mail e do cadastro (regras puras, testáveis sem rede:
 * npm run test:auth). Os dados ficam no banco (0013 e 0014), valendo para todas as
 * instâncias serverless ao mesmo tempo.
 *
 * 1. Limites de tentativas (0013), agora contados de forma ATÔMICA: a tentativa é contada e
 *    decidida numa única operação no banco, antes de falar com o Neon Auth; quem acerta
 *    devolve a própria contagem (efeito final: só as falhas contam). Pedidos simultâneos não
 *    passam do limite. Esses limites são provisórios: saem só com autorização (etapa E3b).
 * 2. Proteção por CONTA (0014), independente de IP e de aparelho: depois de 5 tentativas de
 *    senha sem sucesso (10 num aparelho reconhecido), a senha deixa de ser conferida e o
 *    login exige um código enviado ao e-mail. Nunca bloqueia a dona da conta.
 * 3. Aparelho reconhecido (0014): token aleatório no cookie, só o hash no banco; 90 dias,
 *    até 10 por conta, revogado na troca de senha e na exclusão da conta.
 * 4. Espera progressiva entre envios de código para o MESMO e-mail (0014): imediato, 30 s,
 *    1 min, 2 min, 5 min, 10 min. Por endereço, nunca por rede.
 * Falhas do banco: ver classifyFailure.
 * Limitação conhecida: chamadas feitas direto ao Neon Auth (fora do app) não passam por nada disto.
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

/** Tentativas de senha antes do desafio por código (por conta, de qualquer origem). */
export const GUARD_LIMIT = { unknownDevice: 5, knownDevice: 10 } as const;
export const DEVICE_DAYS = 90;

/**
 * `limit`: a regra de tentativas barrou. `wait`: espera entre envios de código.
 * `unavailable`: o limitador não pôde decidir com segurança (ver classifyFailure) e o
 * pedido é recusado sem consultar o Neon Auth.
 */
export type Decision = { ok: true } | { ok: false; reason: "limit" | "wait" | "unavailable"; retryAfter: number };

export type ConsumeItem = { key: string; scope: Scope; max: number; window: number; block: number; escalate: boolean };
type Verdict = { blocked: boolean; retry_after?: number | null };

/** Acesso ao banco (no app: funções auth_* de 0013/0014, só pelo servidor). */
export interface LimitStore {
  consume(items: ConsumeItem[]): Promise<Verdict>;
  refund(keys: string[]): Promise<void>;
  clear(keys: string[]): Promise<void>;
  guardBegin(account: string, trusted: boolean): Promise<"password" | "code">;
  guardSuccess(account: string): Promise<void>;
  deviceCheck(account: string, tokenHash: string): Promise<boolean>;
  deviceRegister(account: string, tokenHash: string, days: number): Promise<void>;
  deviceRevokeAll(account: string): Promise<void>;
  sendCooldown(key: string): Promise<{ allowed: boolean; retry_after?: number | null }>;
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
  if (kind !== 6) return NO_IP;
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

// ---------------------------------------------------------------- aparelho reconhecido
/** Cookie com o token do aparelho (aleatório, 256 bits). O banco guarda só o SHA-256. */
export const DEVICE_COOKIE = "vp_dev";
export const DEVICE_MAX_AGE = DEVICE_DAYS * 24 * 60 * 60;
export const newDeviceToken = () => randomBytes(32).toString("base64url");
export const isDeviceToken = (t: string | null | undefined): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);
export const hashDeviceToken = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

// ---------------------------------------------------------------- decisões
const deny = (r: Verdict): Decision => ({ ok: false, reason: "limit", retryAfter: Math.max(1, Number(r.retry_after) || 60) });
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

export type Who = { email: string; ip: string };
export type LimiterOptions = {
  log?: (ev: LimiterEvent) => void;
  /** Ambiente publicado: sem IP da plataforma, recusa (é erro de configuração, não "desconhecido"). */
  requireIp?: boolean;
};

/** Resultado do início de um login por senha. */
export type SigninStart =
  | { ok: false; reason: "limit" | "wait" | "unavailable"; retryAfter: number }
  | { ok: true; mode: "password" | "code"; trusted: boolean; ticket: SigninTicket };
/** O que precisa ser devolvido/zerado se a senha estiver certa. */
export type SigninTicket = { account: string; consumed: string[] };

export function makeLimiter(store: LimitStore, secret: string, opts: LimiterOptions = {}) {
  const log = opts.log ?? defaultLog;
  const k = (scope: Scope | "account", value: string) => deriveKey(secret, scope, value);
  const item = (scope: Scope, value: string): ConsumeItem => {
    const r: Rule = RULES[scope];
    return { key: k(scope, value), scope, max: r.max, window: r.window, block: r.block, escalate: Boolean(r.escalate) };
  };
  const keys = {
    pair: (w: Who) => item("signin_pair", `${w.email}\n${w.ip}`),
    ip: (scope: Scope, w: Pick<Who, "ip">) => item(scope, w.ip),
    email: (scope: Scope, w: Pick<Who, "email">) => item(scope, w.email),
  };
  const account = (email: string) => k("account", email);

  /** Falha antes da ação: passa ou recusa conforme o tipo da falha e o fluxo. */
  function onFailure(flow: Flow, step: LimiterEvent["step"], e: unknown): boolean {
    const kind = classifyFailure(e);
    const pass = kind === "transient" || (kind === "unknown" && OPEN_ON_UNKNOWN[flow]);
    log({ flow, step, kind, decision: pass ? "liberado" : "recusado", ...describe(e) });
    return pass;
  }
  function checkIp(ip: string) {
    if (opts.requireIp && ip === NO_IP) throw new LimiterConfigError("IP do cliente ausente em ambiente publicado");
  }
  /** Conta e decide numa única operação (ver auth_limit_consume). */
  async function consume(flow: Flow, ip: string, items: ConsumeItem[]): Promise<Decision> {
    try {
      checkIp(ip);
      const r = await store.consume(items);
      return r.blocked ? deny(r) : { ok: true };
    } catch (e) {
      return onFailure(flow, "check", e) ? { ok: true } : unavailable;
    }
  }
  /** Registro depois da ação: a resposta já foi decidida; uma falha só é registrada. */
  async function record(flow: Flow, step: "record" | "clear", run: () => Promise<unknown>) {
    try {
      await run();
    } catch (e) {
      log({ flow, step, kind: classifyFailure(e), decision: "sem efeito", ...describe(e) });
    }
  }

  return {
    /**
     * Antes de conferir uma senha: limites (contagem atômica) e proteção da conta.
     * `code`: a senha NÃO deve ser conferida; o login segue só por código no e-mail.
     */
    async signinStart(w: Who & { deviceToken?: string | null }): Promise<SigninStart> {
      const acc = account(w.email);
      let trusted = false;
      if (isDeviceToken(w.deviceToken)) {
        try {
          trusted = await store.deviceCheck(acc, hashDeviceToken(w.deviceToken));
        } catch (e) {
          log({ flow: "signin", step: "check", kind: classifyFailure(e), decision: "sem efeito", ...describe(e) });
        }
      }
      const items = [keys.pair(w), keys.ip("signin_ip", w), ...(trusted ? [] : [keys.email("signin_email", w)])];
      const d = await consume("signin", w.ip, items);
      if (!d.ok) return d;
      const ticket: SigninTicket = { account: acc, consumed: items.map((i) => i.key) };
      let mode: "password" | "code";
      try {
        mode = await store.guardBegin(acc, trusted);
      } catch (e) {
        if (!onFailure("signin", "check", e)) {
          await record("signin", "record", () => store.refund(ticket.consumed));
          return unavailable as SigninStart;
        }
        mode = "password";
      }
      if (mode === "code") await record("signin", "record", () => store.refund(ticket.consumed)); // nenhuma senha conferida
      return { ok: true, mode, trusted, ticket };
    },
    /** Senha certa: devolve as contagens e a conta volta ao normal. */
    async signinPasswordOk(t: SigninTicket) {
      await Promise.all([
        record("signin", "clear", () => store.refund(t.consumed)),
        record("signin", "clear", () => store.guardSuccess(t.account)),
      ]);
    },
    /** Login por código concluído: a conta volta ao normal. */
    async codeSigninOk(w: Who) {
      await Promise.all([
        record("signin", "clear", () => store.guardSuccess(account(w.email))),
        record("otp_verify", "clear", () => store.refund([keys.ip("otp_verify_ip", w).key])),
        record("otp_verify", "clear", () => store.clear([keys.email("otp_verify_email", w).key])),
      ]);
    },
    /** Envio de código: espera progressiva por e-mail e limites atuais. */
    async otpSend(w: Who): Promise<Decision> {
      try {
        checkIp(w.ip);
        const c = await store.sendCooldown(k("otp_send_email", `cooldown\n${w.email}`));
        if (!c.allowed) return { ok: false, reason: "wait", retryAfter: Math.max(1, Number(c.retry_after) || 30) };
      } catch (e) {
        if (!onFailure("otp_send", "check", e)) return unavailable;
      }
      return consume("otp_send", w.ip, [keys.email("otp_send_email", w), keys.ip("otp_send_ip", w)]);
    },
    /** Antes de conferir um código de 6 dígitos (verificação, troca de senha ou login). */
    async otpVerifyAllowed(w: Who): Promise<Decision> {
      return consume("otp_verify", w.ip, [keys.email("otp_verify_email", w), keys.ip("otp_verify_ip", w)]);
    },
    /** Código certo: zera a contagem do e-mail e devolve a do IP. */
    async otpVerifyOk(w: Who) {
      await Promise.all([
        record("otp_verify", "clear", () => store.clear([keys.email("otp_verify_email", w).key])),
        record("otp_verify", "clear", () => store.refund([keys.ip("otp_verify_ip", w).key])),
      ]);
    },
    /** Criação de conta: limite atual por IP (provisório). */
    async signup(w: Pick<Who, "ip">): Promise<Decision> {
      return consume("signup", w.ip, [keys.ip("signup_ip", w)]);
    },
    /** Depois de um login completo: (re)registra este aparelho para a conta. */
    async rememberDevice(email: string, token: string) {
      if (!isDeviceToken(token)) return;
      await record("signin", "record", () => store.deviceRegister(account(email), hashDeviceToken(token), DEVICE_DAYS));
    },
    /** Troca de senha ou exclusão da conta: nenhum aparelho continua reconhecido e a proteção zera. */
    async forgetAccount(email: string) {
      const acc = account(email);
      await Promise.all([
        record("signin", "clear", () => store.deviceRevokeAll(acc)),
        record("signin", "clear", () => store.guardSuccess(acc)),
      ]);
    },
  };
}
export type Limiter = ReturnType<typeof makeLimiter>;
