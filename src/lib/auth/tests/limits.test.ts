/**
 * Proteção do login (E1 + E2) — regras e fluxo, sem rede. O banco é simulado em memória
 * com a MESMA lógica das funções auth_* de 0013/0014 (o SQL real é testado em
 * db/tests/protecao_conta.test.sql e, sob 50 pedidos simultâneos, em
 * db/tests/local/simultaneidade.mjs). O Neon Auth é simulado por AuthPort.
 * Rodar: npm run test:auth
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GUARD_LIMIT, LimiterConfigError, NO_IP, RULES, classifyFailure, deriveKey, exactIp, hashDeviceToken, isDeviceToken,
  makeLimiter, newDeviceToken, normalizeIp, type ConsumeItem, type LimitStore, type LimiterEvent,
} from "../limits.ts";
import { DEFAULT_TIMING, codeSignIn, passwordSignIn, sendCodeFlow, type AuthPort } from "../signin-flow.ts";

// nos testes, sem o tempo mínimo das respostas (o teste dedicado abaixo usa um relógio próprio)
DEFAULT_TIMING.floorMs = 0;
DEFAULT_TIMING.jitterMs = 0;

const SECRET = "x".repeat(40);
const quiet = () => {};

// ---------------------------------------------------------------- banco em memória (espelho do SQL)
function memoryStore() {
  let now = 0;
  type Row = { hits: number; start: number; until: number | null; strikes: number; scope: string };
  const attempts = new Map<string, Row>();
  const guard = new Map<string, { attempts: number; last: number }>();
  const devices = new Map<string, { expires: number }>(); // `${account}|${hash}`
  const cooldown = new Map<string, { sends: number; last: number | null; next: number }>();
  const steps = [30, 60, 120, 300, 600];
  const store: LimitStore = {
    async consume(items: ConsumeItem[]) {
      let deny = false, wait = 0;
      const exceed: ConsumeItem[] = [];
      for (const it of [...items].sort((a, b) => a.key.localeCompare(b.key))) {
        const a = attempts.get(it.key) ?? { hits: 0, start: now, until: null, strikes: 0, scope: it.scope };
        attempts.set(it.key, a);
        if (a.until !== null && a.until > now) { deny = true; wait = Math.max(wait, a.until - now); continue; }
        const hits = a.start < now - it.window ? 0 : a.hits;
        if (hits + 1 > it.max) { deny = true; exceed.push(it); }
      }
      for (const it of items) {
        const a = attempts.get(it.key)!;
        if (deny) {
          if (exceed.includes(it)) {
            a.until = now + it.block * (it.escalate ? 2 ** Math.min(a.strikes, 3) : 1);
            a.strikes += 1; a.hits = 0; a.start = now; wait = Math.max(wait, a.until - now);
          }
        } else if (a.start < now - it.window) { a.hits = 1; a.start = now; } else a.hits += 1;
      }
      return deny ? { blocked: true, retry_after: Math.max(wait, 1) } : { blocked: false };
    },
    async refund(keys) { for (const k of keys) { const a = attempts.get(k); if (a && !(a.until !== null && a.until > now)) a.hits = Math.max(a.hits - 1, 0); } },
    async clear(keys) { keys.forEach((k) => attempts.delete(k)); },
    async guardBegin(account, trusted) {
      const g = guard.get(account) ?? { attempts: 0, last: now };
      guard.set(account, g);
      if (g.last < now - 24 * 3600) g.attempts = 0;
      if (g.attempts >= (trusted ? GUARD_LIMIT.knownDevice : GUARD_LIMIT.unknownDevice)) return "code";
      g.attempts += 1; g.last = now;
      return "password";
    },
    async guardSuccess(account) { guard.delete(account); },
    async deviceCheck(account, hash) { const d = devices.get(`${account}|${hash}`); return Boolean(d && d.expires > now); },
    async deviceRegister(account, hash, days) { devices.set(`${account}|${hash}`, { expires: now + days * 86400 }); },
    async deviceRevokeAll(account) { for (const k of [...devices.keys()]) if (k.startsWith(`${account}|`)) devices.delete(k); },
    async sendCooldown(key) {
      const c = cooldown.get(key) ?? { sends: 0, last: null, next: 0 };
      cooldown.set(key, c);
      if (c.next > now) return { allowed: false, retry_after: c.next - now };
      if (c.last === null || c.last < now - 3600) c.sends = 0;
      c.sends += 1; c.last = now; c.next = now + steps[Math.min(c.sends, 5) - 1];
      return { allowed: true };
    },
  };
  return { store, attempts, guard, devices, advance: (s: number) => { now += s; } };
}

/** Neon Auth falso: uma conta com senha e o último código enviado por tipo. */
function fakeAuth(accounts: Record<string, string> = { "familia@x.com": "senha-certa-123" }) {
  const calls = { password: 0, sends: [] as string[], codeTries: 0, exists: 0 };
  const lastCode = new Map<string, string>();
  const port: AuthPort = {
    async signInPassword(email, password) {
      calls.password += 1;
      return accounts[email] === password ? { ok: true, emailVerified: true } : { ok: false, kind: "invalid" };
    },
    async sendCode(email, type) {
      calls.sends.push(`${type}:${email}`);
      lastCode.set(email, "123456");
      return "ok";
    },
    async signInCode(email, otp) {
      calls.codeTries += 1;
      return lastCode.get(email) === otp ? { ok: true } : { ok: false, kind: "code" };
    },
    async accountExists(email) {
      calls.exists += 1;
      return email in accounts;
    },
  };
  return { port, calls };
}
const IP1 = "203.0.113.10", IP2 = "198.51.100.20", IP3 = "192.0.2.30";
const FAM = "familia@x.com";

// ================================================================ chaves, IP, tokens
test("chaves: HMAC estável, sem e-mail/IP em texto, separadas por escopo", () => {
  const a = deriveKey(SECRET, "signin_pair", "a@b.com");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, deriveKey(SECRET, "signin_pair", "a@b.com"));
  assert.notEqual(a, deriveKey(SECRET, "account", "a@b.com"));
  assert.notEqual(a, deriveKey("y".repeat(40), "signin_pair", "a@b.com"));
});

test("IP: IPv4, IPv6 por bloco /64, IPv4 mapeado e valores inválidos", () => {
  assert.equal(normalizeIp("203.0.113.9, 10.0.0.1"), "203.0.113.9");
  assert.equal(normalizeIp("2001:db8:1:2:aaaa::1"), "2001:0db8:0001:0002::/64");
  assert.equal(normalizeIp("::ffff:198.51.100.7"), "198.51.100.7");
  assert.equal(normalizeIp("abc; drop table"), NO_IP);
  assert.equal(normalizeIp(null), NO_IP);
});

test("token do aparelho: aleatório, 256 bits, só o hash vai ao banco", () => {
  const t1 = newDeviceToken(), t2 = newDeviceToken();
  assert.ok(isDeviceToken(t1) && isDeviceToken(t2));
  assert.notEqual(t1, t2);
  assert.equal(Buffer.from(t1, "base64url").length, 32);
  assert.match(hashDeviceToken(t1), /^[0-9a-f]{64}$/);
  assert.ok(!hashDeviceToken(t1).includes(t1));
  assert.ok(!isDeviceToken("inventado") && !isDeviceToken(null) && !isDeviceToken(`${t1}x`));
});

// ================================================================ fluxo de entrada
test("senha certa entra; senha errada é contada e recusada", async () => {
  const m = memoryStore(), f = fakeAuth();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  assert.deepEqual(await passwordSignIn(L, f.port, { email: FAM, password: "errada-1", ip: IP1 }), { kind: "error", error: "invalid" });
  assert.deepEqual(await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: IP1 }), { kind: "ok", emailVerified: true });
  assert.equal(m.guard.size, 0, "login completo zera a proteção da conta");
});

test("proteção por conta: 5 erros (de IPs diferentes) → só com código; a senha deixa de ser conferida", async () => {
  const m = memoryStore(), f = fakeAuth();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  const ips = [IP1, IP2, IP3, "203.0.113.11", "203.0.113.12"];
  for (const ip of ips) assert.equal((await passwordSignIn(L, f.port, { email: FAM, password: "chute", ip })).kind, "error");
  const before = f.calls.password;
  const r = await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: "203.0.113.99" });
  assert.deepEqual(r, { kind: "challenge", sent: null }, "nem a senha certa é aceita: pede código");
  assert.equal(f.calls.password, before, "a senha não foi enviada ao Neon Auth");
  assert.ok(f.calls.sends.includes(`sign-in:${FAM}`), "um código de entrada foi enviado ao e-mail");
});

test("trocar de IP ou de aparelho desconhecido não contorna a proteção", async () => {
  const m = memoryStore(), f = fakeAuth();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  for (let i = 0; i < 5; i++) await passwordSignIn(L, f.port, { email: FAM, password: `x${i}`, ip: IP1, deviceToken: newDeviceToken() });
  for (const ip of [IP2, IP3]) {
    const r = await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip, deviceToken: newDeviceToken() });
    assert.equal(r.kind, "challenge", `de ${ip} com outro aparelho, continua exigindo código`);
  }
});

test("entrar com o código: certo entra e zera; errado é recusado", async () => {
  const m = memoryStore(), f = fakeAuth();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  for (let i = 0; i < 5; i++) await passwordSignIn(L, f.port, { email: FAM, password: `x${i}`, ip: `203.0.113.${20 + i}` });
  assert.equal((await passwordSignIn(L, f.port, { email: FAM, password: "?", ip: IP1 })).kind, "challenge");
  assert.deepEqual(await codeSignIn(L, f.port, { email: FAM, code: "000000", ip: IP1 }), { kind: "error", error: "code" });
  assert.deepEqual(await codeSignIn(L, f.port, { email: FAM, code: "123456", ip: IP1 }), { kind: "ok" });
  assert.equal(m.guard.size, 0, "a conta voltou ao normal");
  assert.equal((await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: IP1 })).kind, "ok");
});

test("aparelho reconhecido: mais folga (10), mas também é desafiado; não dispensa a proteção", async () => {
  const m = memoryStore(), f = fakeAuth();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  const token = newDeviceToken();
  await L.rememberDevice(FAM, token);
  for (let i = 0; i < 5; i++) await passwordSignIn(L, f.port, { email: FAM, password: `x${i}`, ip: `203.0.113.${50 + i}` });
  assert.equal((await passwordSignIn(L, f.port, { email: FAM, password: "?", ip: IP1 })).kind, "challenge", "aparelho desconhecido desafiado");
  assert.equal((await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: IP2, deviceToken: token })).kind, "ok",
    "a família, no aparelho dela, entra com a senha mesmo durante o ataque");
  for (let i = 0; i < 10; i++) await passwordSignIn(L, f.port, { email: FAM, password: `y${i}`, ip: `198.51.100.${60 + i}`, deviceToken: token });
  assert.equal((await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: IP2, deviceToken: token })).kind, "challenge",
    "com 10 erros, o aparelho reconhecido também precisa do código");
});

test("token de aparelho de outra conta, inventado ou revogado não vale", async () => {
  const m = memoryStore(), f = fakeAuth({ [FAM]: "senha-certa-123", "outra@x.com": "outra-senha-123" });
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  const token = newDeviceToken();
  await L.rememberDevice("outra@x.com", token);
  for (let i = 0; i < 5; i++) await passwordSignIn(L, f.port, { email: FAM, password: `x${i}`, ip: `203.0.113.${30 + i}` });
  assert.equal((await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: IP1, deviceToken: token })).kind, "challenge", "token de outra conta");
  assert.equal((await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: IP1, deviceToken: "inventado" })).kind, "challenge", "token inventado");
  const mine = newDeviceToken();
  await L.rememberDevice(FAM, mine);
  await L.forgetAccount(FAM); // troca de senha ou exclusão
  assert.equal(m.devices.size, 1, "só o aparelho da outra conta sobrou");
  m.advance(3601); // passa a janela de 1 h do limite atual por e-mail (0013)
  for (let i = 0; i < 5; i++) await passwordSignIn(L, f.port, { email: FAM, password: `z${i}`, ip: `203.0.113.${40 + i}` });
  assert.equal((await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: IP1, deviceToken: mine })).kind, "challenge", "token revogado");
});

test("aparelho vencido (90 dias) deixa de ser reconhecido", async () => {
  const m = memoryStore(), f = fakeAuth();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  const token = newDeviceToken();
  await L.rememberDevice(FAM, token);
  m.advance(91 * 86400);
  for (let i = 0; i < 5; i++) await passwordSignIn(L, f.port, { email: FAM, password: `x${i}`, ip: `203.0.113.${100 + i}` });
  assert.equal((await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: IP1, deviceToken: token })).kind, "challenge");
});

test("proteção da conta recomeça após 24 h sem tentativas", async () => {
  const m = memoryStore(), f = fakeAuth();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  for (let i = 0; i < 5; i++) await passwordSignIn(L, f.port, { email: FAM, password: `x${i}`, ip: `203.0.113.${60 + i}` });
  m.advance(25 * 3600);
  assert.equal((await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: IP1 })).kind, "ok");
});

test("pedido de código: espera progressiva por e-mail (não por rede) e o último código continua valendo", async () => {
  const m = memoryStore(), f = fakeAuth();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  assert.equal(await sendCodeFlow(L, f.port, { email: FAM, ip: IP1 }, "sign-in"), null, "1º envio imediato");
  assert.equal(await sendCodeFlow(L, f.port, { email: FAM, ip: IP2 }, "sign-in"), "wait", "2º logo depois, de outra rede: espera");
  assert.equal(await sendCodeFlow(L, f.port, { email: "vizinho@x.com", ip: IP1 }, "sign-in"), null, "outra família na mesma rede não espera");
  assert.deepEqual(await codeSignIn(L, f.port, { email: FAM, code: "123456", ip: IP1 }), { kind: "ok" }, "o código já enviado continua valendo");
  m.advance(31);
  assert.equal(await sendCodeFlow(L, f.port, { email: FAM, ip: IP1 }, "sign-in"), null, "após 30 s, envia de novo");
  m.advance(10);
  assert.equal(await sendCodeFlow(L, f.port, { email: FAM, ip: IP1 }, "sign-in"), "wait", "agora a espera é de 1 min");
  assert.equal(await sendCodeFlow(L, f.port, { email: FAM, ip: IP1 }, "forget-password"), null, "outro tipo de código (recuperação) tem espera própria");
  assert.equal(await sendCodeFlow(L, f.port, { email: FAM, ip: IP1 }, "forget-password"), "wait", "e também espera entre envios do mesmo tipo");
});

test("ataque de incômodo: alguém força o desafio e pede códigos — a família continua entrando", async () => {
  const m = memoryStore(), f = fakeAuth();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  const token = newDeviceToken();
  await L.rememberDevice(FAM, token);
  // atacante: 5 senhas erradas e vários pedidos de código, de IPs diferentes
  for (let i = 0; i < 5; i++) await passwordSignIn(L, f.port, { email: FAM, password: `x${i}`, ip: `198.51.100.${i}` });
  for (let i = 0; i < 6; i++) { await sendCodeFlow(L, f.port, { email: FAM, ip: `198.51.100.${10 + i}` }, "sign-in"); m.advance(5); }
  // família no aparelho dela: senha
  assert.equal((await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: IP3, deviceToken: token })).kind, "ok");
  // família em aparelho novo: usa o código que o próprio ataque fez chegar ao e-mail dela
  for (let i = 0; i < 5; i++) await passwordSignIn(L, f.port, { email: FAM, password: `w${i}`, ip: `198.51.100.${40 + i}` });
  // LIMITAÇÃO DOS LIMITES ATUAIS (0013): 10 erros por e-mail em 1 h bloqueiam aparelhos novos por 1 h.
  // É esse bloqueio que a E3b substitui pelo desafio por código (exige autorização).
  assert.deepEqual(await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: "203.0.113.200" }), { kind: "error", error: "tooMany" });
  m.advance(3601);
  assert.equal((await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: "203.0.113.200" })).kind, "challenge");
  assert.deepEqual(await codeSignIn(L, f.port, { email: FAM, code: "123456", ip: IP3 }), { kind: "ok" });
});

test("conta inexistente: mesma resposta (não revela se o e-mail tem conta)", async () => {
  const m = memoryStore(), f = fakeAuth();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  const a = [], b = [];
  for (let i = 0; i < 6; i++) a.push((await passwordSignIn(L, f.port, { email: FAM, password: `x${i}`, ip: `203.0.113.${70 + i}` })).kind);
  for (let i = 0; i < 6; i++) b.push((await passwordSignIn(L, f.port, { email: "naoexiste@x.com", password: `x${i}`, ip: `203.0.113.${80 + i}` })).kind);
  assert.deepEqual(a, b);
});

test("e-mail sem conta: nenhum código de ENTRADA é enviado nem conferido, e a resposta é a mesma", async () => {
  const m = memoryStore(), f = fakeAuth();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  const NONE = "naoexiste@x.com";
  for (let i = 0; i < 5; i++) await passwordSignIn(L, f.port, { email: NONE, password: `x${i}`, ip: `203.0.113.${150 + i}` });
  const r = await passwordSignIn(L, f.port, { email: NONE, password: "y", ip: IP1 });
  assert.deepEqual(r, { kind: "challenge", sent: null }, "mesma resposta de uma conta real");
  assert.ok(!f.calls.sends.some((x) => x === `sign-in:${NONE}`), "nenhum código de entrada enviado ao e-mail sem conta");
  m.advance(31);
  assert.equal(await sendCodeFlow(L, f.port, { email: NONE, ip: IP1 }, "sign-in"), null, "reenviar: mesma resposta, nada enviado");
  assert.ok(!f.calls.sends.some((x) => x === `sign-in:${NONE}`));
  const before = f.calls.codeTries;
  assert.deepEqual(await codeSignIn(L, f.port, { email: NONE, code: "123456", ip: IP1 }), { kind: "error", error: "code" }, "código para e-mail sem conta: 'código inválido'");
  assert.equal(f.calls.codeTries, before, "o Neon Auth nem é chamado (não cria conta por este caminho)");
  // códigos de outros tipos seguem para o Neon Auth, que não cria conta com eles
  assert.equal(await sendCodeFlow(L, f.port, { email: NONE, ip: IP1 }, "forget-password"), null);
  assert.ok(f.calls.sends.includes(`forget-password:${NONE}`));
});

test("conta existente continua recebendo e usando o código de entrada", async () => {
  const m = memoryStore(), f = fakeAuth();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  assert.equal(await sendCodeFlow(L, f.port, { email: FAM, ip: IP1 }, "sign-in"), null);
  assert.ok(f.calls.sends.includes(`sign-in:${FAM}`));
  assert.deepEqual(await codeSignIn(L, f.port, { email: FAM, code: "123456", ip: IP1 }), { kind: "ok" });
});

test("sem confirmar a conta (banco indisponível), nenhum código de entrada é enviado nem conferido", async () => {
  const m = memoryStore(), f = fakeAuth();
  const port: AuthPort = { ...f.port, accountExists: async () => { throw new Error("sem banco"); } };
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  assert.equal(await sendCodeFlow(L, port, { email: FAM, ip: IP1 }, "sign-in"), "unavailable");
  assert.deepEqual(await codeSignIn(L, port, { email: FAM, code: "123456", ip: IP1 }), { kind: "error", error: "unavailable" });
  assert.equal(f.calls.sends.length + f.calls.codeTries, 0);
});

test("tempo de resposta: com ou sem conta, o pedido de código espera o mesmo mínimo", async () => {
  const waits: number[] = [];
  const timing = { floorMs: 900, jitterMs: 0, sleep: async (ms: number) => { waits.push(ms); } };
  const f = fakeAuth();
  await sendCodeFlow(null, f.port, { email: FAM, ip: IP1 }, "sign-in", timing);
  await sendCodeFlow(null, f.port, { email: "naoexiste@x.com", ip: IP1 }, "sign-in", timing);
  assert.equal(waits.length, 2, "os dois caminhos completam o tempo mínimo");
  assert.ok(waits.every((w) => w > 850 && w <= 900), JSON.stringify(waits));
});

test("limites atuais (0013) continuam valendo, agora sem corrida", async () => {
  const m = memoryStore(), f = fakeAuth();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  // mesmo e-mail e mesmo IP, com aparelho reconhecido (a proteção por conta só desafia em 10)
  const token = newDeviceToken();
  await L.rememberDevice(FAM, token);
  for (let i = 0; i < RULES.signin_pair.max; i++) await passwordSignIn(L, f.port, { email: FAM, password: `x${i}`, ip: IP1, deviceToken: token });
  assert.deepEqual(await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: IP1, deviceToken: token }), { kind: "error", error: "tooMany" });
  // senha certa devolve a contagem: só falhas contam
  const m2 = memoryStore(); const L2 = makeLimiter(m2.store, SECRET, { log: quiet });
  for (let i = 0; i < 12; i++) assert.equal((await passwordSignIn(L2, f.port, { email: FAM, password: "senha-certa-123", ip: IP1 })).kind, "ok");
});

test("limite atual por e-mail+IP (provisório) ainda bloqueia antes do desafio — sai só na E3b", async () => {
  const m = memoryStore(), f = fakeAuth();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  for (let i = 0; i < 5; i++) await passwordSignIn(L, f.port, { email: FAM, password: `x${i}`, ip: IP1 });
  assert.deepEqual(await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: IP1 }), { kind: "error", error: "tooMany" },
    "mesmo e-mail e mesma rede: bloqueio de 15 min de 0013 (comportamento atual mantido)");
  assert.equal((await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: IP2 })).kind, "challenge",
    "de outra rede: só o desafio por código (sem bloqueio)");
});

test("cadastro e códigos: limites atuais preservados", async () => {
  const m = memoryStore();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  for (let i = 0; i < RULES.signup_ip.max; i++) assert.deepEqual(await L.signup({ ip: IP1 }), { ok: true });
  assert.equal((await L.signup({ ip: IP1 })).ok, false);
  const w = { email: FAM, ip: IP1 };
  for (let i = 0; i < RULES.otp_verify_email.max; i++) assert.deepEqual(await L.otpVerifyAllowed(w), { ok: true });
  assert.equal((await L.otpVerifyAllowed(w)).ok, false);
});

test("recuperação de senha: aparelhos revogados e proteção zerada", async () => {
  const m = memoryStore(), f = fakeAuth();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  const token = newDeviceToken();
  await L.rememberDevice(FAM, token);
  for (let i = 0; i < 5; i++) await passwordSignIn(L, f.port, { email: FAM, password: `x${i}`, ip: `203.0.113.${90 + i}` });
  await L.otpVerifyOk({ email: FAM, ip: IP1 });
  await L.forgetAccount(FAM); // o que resetPassword faz depois do Neon trocar a senha
  assert.equal(m.devices.size, 0, "nenhum aparelho continua reconhecido");
  assert.equal(m.guard.size, 0, "a conta volta ao normal");
  assert.equal((await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: IP1, deviceToken: token })).kind, "ok");
});

// ================================================================ falhas do banco (E1)
const neonErr = (props: Record<string, unknown>, message = "erro") => Object.assign(new Error(message), { name: "NeonDbError", ...props });
function failing(e: unknown): LimitStore {
  const boom = async () => { throw e; };
  return { consume: boom, refund: boom, clear: boom, guardBegin: boom, guardSuccess: boom, deviceCheck: boom, deviceRegister: boom, deviceRevokeAll: boom, sendCooldown: boom };
}
const W = { email: "a@x.com", ip: "203.0.113.9" };

test("classificação: configuração, passageira e desconhecida", () => {
  for (const code of ["42883", "42P01", "42703", "42501", "28P01", "28000", "3D000", "3F000", "P0001", "23514", "22P02"]) {
    assert.equal(classifyFailure(neonErr({ code })), "config", code);
  }
  for (const code of ["08006", "08001", "53300", "57P01", "57P03", "40001", "40P01"]) {
    assert.equal(classifyFailure(neonErr({ code })), "transient", code);
  }
  assert.equal(classifyFailure(neonErr({ code: "XX000" })), "unknown");
  assert.equal(classifyFailure(neonErr({ sourceError: new TypeError("fetch failed") }, "Error connecting to database")), "transient");
  assert.equal(classifyFailure(Object.assign(new Error("tempo"), { name: "TimeoutError" })), "transient");
  assert.equal(classifyFailure(neonErr({}, "Server error (HTTP status 403): forbidden")), "config");
  assert.equal(classifyFailure(neonErr({}, "Server error (HTTP status 503): unavailable")), "transient");
  assert.equal(classifyFailure(neonErr({}, "Server error (HTTP status 404): not found")), "unknown");
  assert.equal(classifyFailure(new Error("DATABASE_URL não configurada")), "config");
  assert.equal(classifyFailure(new LimiterConfigError("x")), "config");
  assert.equal(classifyFailure(new TypeError("Cannot read properties of undefined")), "config");
  assert.equal(classifyFailure(Object.assign(new Error("reset"), { code: "ECONNRESET", sourceError: new Error("x") })), "transient");
  assert.equal(classifyFailure(null), "unknown");
});

test("erro de configuração: recusa todos os fluxos sem chamar o Neon Auth", async () => {
  const events: LimiterEvent[] = [];
  const f = fakeAuth();
  const L = makeLimiter(failing(neonErr({ code: "42883" })), SECRET, { log: (e) => events.push(e) });
  assert.deepEqual(await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: IP1 }), { kind: "error", error: "unavailable" });
  assert.equal(await sendCodeFlow(L, f.port, { email: FAM, ip: IP1 }, "sign-in"), "unavailable");
  assert.deepEqual(await codeSignIn(L, f.port, { email: FAM, code: "123456", ip: IP1 }), { kind: "error", error: "unavailable" });
  assert.equal((await L.signup(W)).ok, false);
  assert.equal(f.calls.password + f.calls.codeTries + f.calls.sends.length, 0, "nada chegou ao Neon Auth");
  assert.ok(events.some((e) => e.kind === "config" && e.decision === "recusado"));
});

test("erro de configuração só na proteção da conta (contagem ok): também recusa", async () => {
  const m = memoryStore(), f = fakeAuth();
  const store = { ...m.store, guardBegin: async () => { throw neonErr({ code: "42883" }); } };
  const L = makeLimiter(store, SECRET, { log: quiet });
  assert.deepEqual(await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: IP1 }), { kind: "error", error: "unavailable" });
  assert.equal(f.calls.password, 0);
});

test("falha passageira: login, cadastro e códigos seguem, com registro", async () => {
  const events: LimiterEvent[] = [];
  const f = fakeAuth();
  const L = makeLimiter(failing(neonErr({ sourceError: new Error("ECONNRESET") }, "Error connecting to database")), SECRET, { log: (e) => events.push(e) });
  assert.equal((await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: IP1 })).kind, "ok");
  assert.equal(await sendCodeFlow(L, f.port, { email: FAM, ip: IP1 }, "sign-in"), null);
  assert.deepEqual(await L.signup(W), { ok: true });
  assert.ok(events.every((e) => e.kind === "transient"));
});

test("falha desconhecida: libera só o login", async () => {
  const f = fakeAuth();
  const L = makeLimiter(failing(new Error("algo inesperado")), SECRET, { log: quiet });
  assert.equal((await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: IP1 })).kind, "ok");
  assert.equal(await sendCodeFlow(L, f.port, { email: FAM, ip: IP1 }, "sign-in"), "unavailable");
  assert.equal((await L.signup(W)).ok, false);
});

test("ambiente publicado sem IP: recusa; local sem IP segue", async () => {
  const f = fakeAuth();
  const L = makeLimiter(memoryStore().store, SECRET, { requireIp: true, log: quiet });
  assert.deepEqual(await passwordSignIn(L, f.port, { email: FAM, password: "senha-certa-123", ip: NO_IP }), { kind: "error", error: "unavailable" });
  assert.equal(await sendCodeFlow(L, f.port, { email: FAM, ip: NO_IP }, "sign-in"), "unavailable");
  const local = makeLimiter(memoryStore().store, SECRET, { log: quiet });
  assert.equal((await passwordSignIn(local, f.port, { email: FAM, password: "senha-certa-123", ip: NO_IP })).kind, "ok");
});

test("o registro nunca leva e-mail, IP ou mensagem do erro", async () => {
  const events: LimiterEvent[] = [];
  const L = makeLimiter(failing(neonErr({ code: "42883" }, "detalhe com a@x.com e 203.0.113.9")), SECRET, { log: (e) => events.push(e) });
  await L.signinStart({ ...W, deviceToken: newDeviceToken() });
  const text = JSON.stringify(events);
  assert.ok(!text.includes("a@x.com") && !text.includes("203.0.113.9") && !text.includes("detalhe"), text);
  for (const e of events) assert.deepEqual(Object.keys(e).sort(), ["code", "decision", "error", "flow", "kind", "step"]);
});

test("IP exato para consentimento: só endereço válido", () => {
  const get = (h: Record<string, string>) => (n: string) => h[n] ?? null;
  assert.equal(exactIp(get({ "x-real-ip": "203.0.113.7" })), "203.0.113.7");
  assert.equal(exactIp(get({ "x-forwarded-for": "2001:db8::1, 10.0.0.1" })), "2001:db8::1");
  assert.equal(exactIp(get({ "x-forwarded-for": "não é ip" })), null);
});
