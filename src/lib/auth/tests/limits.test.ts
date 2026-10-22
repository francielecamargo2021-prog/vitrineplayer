/**
 * Limite de tentativas — regras e decisões, sem rede (o banco é simulado em memória,
 * com a mesma lógica das funções auth_limit_* da migration 0013).
 * Rodar: npm run test:auth
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LimiterConfigError, NO_IP, RULES, addDeviceMark, classifyFailure, deriveKey, exactIp, isTrustedDevice, makeLimiter, normalizeIp, type LimitStore, type LimiterEvent, type Rule } from "../limits.ts";

const SECRET = "x".repeat(40);

function memoryStore() {
  let now = 0;
  const rows = new Map<string, { hits: number; start: number; until: number | null; strikes: number }>();
  const store: LimitStore = {
    async check(keys) {
      const live = keys.map((k) => rows.get(k)?.until ?? 0).filter((u) => u > now);
      return live.length ? { blocked: true, retry_after: Math.max(...live) - now } : { blocked: false };
    },
    async hit(key, _scope, r: Rule) {
      const a = rows.get(key) ?? { hits: 0, start: now, until: null, strikes: 0 };
      if (a.start < now - r.window) { a.hits = 0; a.start = now; }
      a.hits += 1;
      if (a.hits >= r.max && (a.until === null || a.until <= now)) {
        a.until = now + r.block * (r.escalate ? 2 ** Math.min(a.strikes, 3) : 1);
        a.strikes += 1; a.hits = 0; a.start = now;
      }
      rows.set(key, a);
      return { blocked: a.until !== null && a.until > now, retry_after: a.until && a.until > now ? a.until - now : null };
    },
    async clear(keys) { keys.forEach((k) => rows.delete(k)); },
  };
  return { store, rows, advance: (s: number) => { now += s; } };
}
const quiet = () => {};

test("chaves: HMAC estável, sem e-mail/IP em texto, separadas por escopo", () => {
  const a = deriveKey(SECRET, "signin_pair", "a@b.com");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, deriveKey(SECRET, "signin_pair", "a@b.com"));
  assert.notEqual(a, deriveKey(SECRET, "signin_email", "a@b.com"));
  assert.notEqual(a, deriveKey("y".repeat(40), "signin_pair", "a@b.com"));
  assert.ok(!a.includes("a@b"));
});

test("IP: IPv4, IPv6 por bloco /64, IPv4 mapeado e valores inválidos", () => {
  assert.equal(normalizeIp("203.0.113.9, 10.0.0.1"), "203.0.113.9");
  assert.equal(normalizeIp("2001:db8:1:2:aaaa::1"), "2001:0db8:0001:0002::/64");
  assert.equal(normalizeIp("2001:db8:1:2:ffff:ffff:ffff:ffff"), "2001:0db8:0001:0002::/64");
  assert.equal(normalizeIp("::ffff:198.51.100.7"), "198.51.100.7");
  assert.equal(normalizeIp("[2001:db8::5]"), "2001:0db8:0000:0000::/64");
  assert.equal(normalizeIp("abc; drop table"), "desconhecido");
  assert.equal(normalizeIp(null), "desconhecido");
});

test("aparelho confiável: marca assinada, por conta, até 5 contas", () => {
  let c = addDeviceMark(SECRET, "a@b.com", null);
  assert.ok(isTrustedDevice(SECRET, "a@b.com", c));
  assert.ok(!isTrustedDevice(SECRET, "outra@b.com", c));
  assert.ok(!isTrustedDevice("y".repeat(40), "a@b.com", c), "outra chave do servidor não reconhece a marca");
  assert.ok(!isTrustedDevice(SECRET, "a@b.com", "inventado"));
  for (const e of ["1@x.com", "2@x.com", "3@x.com", "4@x.com", "5@x.com"]) c = addDeviceMark(SECRET, e, c);
  assert.equal(c.split(".").length, 5);
  assert.ok(isTrustedDevice(SECRET, "5@x.com", c));
  assert.ok(!isTrustedDevice(SECRET, "a@b.com", c), "a mais antiga sai");
  assert.equal(addDeviceMark(SECRET, "5@x.com", c), c.split(".").slice(0, 5).join("."), "sem duplicar");
});

test("login: 5 senhas erradas do mesmo IP bloqueiam esse e-mail nesse IP", async () => {
  const m = memoryStore();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  const w = { email: "vitima@x.com", ip: "203.0.113.1" };
  for (let i = 0; i < 4; i++) {
    assert.deepEqual(await L.signinAllowed(w), { ok: true });
    await L.signinFailed(w);
  }
  assert.deepEqual(await L.signinAllowed(w), { ok: true }, "a 5ª tentativa ainda é conferida");
  await L.signinFailed(w);
  const d = await L.signinAllowed(w);
  assert.equal(d.ok, false);
  assert.equal(!d.ok && d.retryAfter, RULES.signin_pair.block);
  assert.deepEqual(await L.signinAllowed({ ...w, ip: "198.51.100.2" }), { ok: true }, "de outro lugar, a dona da conta continua entrando");
  m.advance(RULES.signin_pair.block + 1);
  assert.deepEqual(await L.signinAllowed(w), { ok: true }, "a espera acaba");
});

test("login: reincidência dobra a espera (até 8×)", async () => {
  const m = memoryStore();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  // aparelho confiável: isola o contador e-mail + IP (o do e-mail tem espera fixa)
  const w = { email: "a@x.com", ip: "203.0.113.1", trusted: true };
  const waits: number[] = [];
  for (let round = 0; round < 5; round++) {
    for (let i = 0; i < 5; i++) await L.signinFailed(w);
    const d = await L.signinAllowed(w);
    waits.push(d.ok ? 0 : d.retryAfter);
    m.advance(d.ok ? 0 : d.retryAfter + 1);
  }
  const b = RULES.signin_pair.block;
  assert.deepEqual(waits, [b, 2 * b, 4 * b, 8 * b, 8 * b]);
});

test("login: um IP testando muitas contas é bloqueado", async () => {
  const m = memoryStore();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  for (let i = 0; i < 20; i++) await L.signinFailed({ email: `c${i}@x.com`, ip: "203.0.113.50" });
  assert.equal((await L.signinAllowed({ email: "nova@x.com", ip: "203.0.113.50" })).ok, false);
  assert.equal((await L.signinAllowed({ email: "nova@x.com", ip: "203.0.113.51" })).ok, true);
});

test("bloqueio abusivo: ataque distribuído trava o e-mail só para aparelhos desconhecidos", async () => {
  const m = memoryStore();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  const email = "vitima@x.com";
  for (let i = 0; i < 10; i++) await L.signinFailed({ email, ip: `198.51.100.${i}` });
  assert.equal((await L.signinAllowed({ email, ip: "203.0.113.200" })).ok, false, "aparelho novo espera");
  assert.deepEqual(await L.signinAllowed({ email, ip: "203.0.113.200", trusted: true }), { ok: true }, "o aparelho da dona da conta entra");
  // a espera por e-mail não cresce com novas rodadas
  m.advance(RULES.signin_email.block + 1);
  for (let i = 0; i < 10; i++) await L.signinFailed({ email, ip: `192.0.2.${i}` });
  const d = await L.signinAllowed({ email, ip: "203.0.113.200" });
  assert.equal(!d.ok && d.retryAfter, RULES.signin_email.block);
});

test("login certo zera e-mail + IP e e-mail, mas não o contador do IP", async () => {
  const m = memoryStore();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  const w = { email: "a@x.com", ip: "203.0.113.9" };
  for (let i = 0; i < 4; i++) await L.signinFailed(w);
  await L.signinSucceeded(w);
  for (let i = 0; i < 4; i++) await L.signinFailed(w);
  assert.equal((await L.signinAllowed(w)).ok, true, "contagem recomeçou");
  const ipKey = deriveKey(SECRET, "signin_ip", w.ip);
  assert.equal(m.rows.get(ipKey)?.hits, 8, "o IP continua contando (entrar na própria conta não limpa ataques a outras)");
});

test("códigos por e-mail: 5 envios por hora; conferência: 5 erros em 15 min", async () => {
  const m = memoryStore();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  const w = { email: "a@x.com", ip: "203.0.113.9" };
  for (let i = 0; i < 5; i++) assert.deepEqual(await L.otpSend(w), { ok: true });
  assert.equal((await L.otpSend(w)).ok, false);
  assert.equal((await L.otpSend({ ...w, email: "b@x.com" })).ok, true, "outro e-mail não é afetado");
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(await L.otpVerifyAllowed(w), { ok: true });
    await L.otpVerifyFailed(w);
  }
  assert.equal((await L.otpVerifyAllowed(w)).ok, false);
  m.advance(RULES.otp_verify_email.block + 1);
  assert.deepEqual(await L.otpVerifyAllowed(w), { ok: true });
});

test("cadastro: 10 contas por IP por hora", async () => {
  const m = memoryStore();
  const L = makeLimiter(m.store, SECRET, { log: quiet });
  for (let i = 0; i < 10; i++) assert.deepEqual(await L.signup({ ip: "203.0.113.9" }), { ok: true });
  assert.equal((await L.signup({ ip: "203.0.113.9" })).ok, false);
});

// ---------------------------------------------------------------- falhas do limitador (E1)
/** Erros no formato do driver @neondatabase/serverless (NeonDbError). */
const neonErr = (props: Record<string, unknown>, message = "erro") => Object.assign(new Error(message), { name: "NeonDbError", ...props });
const failing = (e: unknown): LimitStore => ({
  check: async () => { throw e; },
  hit: async () => { throw e; },
  clear: async () => { throw e; },
});
const W = { email: "a@x.com", ip: "203.0.113.9" };

test("classificação: configuração, passageira e desconhecida", () => {
  for (const code of ["42883", "42P01", "42703", "42501", "28P01", "28000", "3D000", "3F000", "P0001", "23514", "22P02"]) {
    assert.equal(classifyFailure(neonErr({ code })), "config", code);
  }
  for (const code of ["08006", "08001", "53300", "57P01", "57P03", "40001", "40P01"]) {
    assert.equal(classifyFailure(neonErr({ code })), "transient", code);
  }
  assert.equal(classifyFailure(neonErr({ code: "XX000" })), "unknown", "SQLSTATE fora das listas");
  // a requisição nem chegou ao banco (rede, TLS) ou o tempo esgotou
  assert.equal(classifyFailure(neonErr({ sourceError: new TypeError("fetch failed") }, "Error connecting to database: fetch failed")), "transient");
  assert.equal(classifyFailure(Object.assign(new Error("tempo"), { name: "TimeoutError" })), "transient");
  assert.equal(classifyFailure(Object.assign(new Error("abortado"), { name: "AbortError" })), "transient");
  // respostas de erro do proxy HTTP do Neon
  assert.equal(classifyFailure(neonErr({}, "Server error (HTTP status 403): forbidden")), "config");
  assert.equal(classifyFailure(neonErr({}, "Server error (HTTP status 401): unauthorized")), "config");
  assert.equal(classifyFailure(neonErr({}, "Server error (HTTP status 503): unavailable")), "transient");
  assert.equal(classifyFailure(neonErr({}, "Server error (HTTP status 429): too many")), "transient");
  assert.equal(classifyFailure(neonErr({}, "Server error (HTTP status 404): not found")), "unknown");
  // ambiente e programação
  assert.equal(classifyFailure(new Error("DATABASE_URL não configurada")), "config");
  assert.equal(classifyFailure(new LimiterConfigError("x")), "config");
  assert.equal(classifyFailure(new TypeError("Cannot read properties of undefined")), "config");
  // código de sistema (não é SQLSTATE) não confunde a classificação
  assert.equal(classifyFailure(Object.assign(new Error("reset"), { code: "ECONNRESET", sourceError: new Error("x") })), "transient");
  assert.equal(classifyFailure(new Error("resposta vazia do limitador")), "unknown");
  assert.equal(classifyFailure("texto"), "unknown");
  assert.equal(classifyFailure(null), "unknown");
});

test("erro de configuração: recusa em todos os fluxos (não esconde o problema)", async () => {
  const events: LimiterEvent[] = [];
  const L = makeLimiter(failing(neonErr({ code: "42883" }, "function auth_limit_check does not exist")), SECRET, { log: (e) => events.push(e) });
  const no = { ok: false, reason: "unavailable", retryAfter: 60 };
  assert.deepEqual(await L.signinAllowed(W), no);
  assert.deepEqual(await L.signup(W), no);
  assert.deepEqual(await L.otpSend(W), no);
  assert.deepEqual(await L.otpVerifyAllowed(W), no);
  assert.equal(events.length, 4);
  assert.ok(events.every((e) => e.kind === "config" && e.decision === "recusado" && e.code === "42883"));
});

test("falha passageira: libera em todos os fluxos e registra", async () => {
  const events: LimiterEvent[] = [];
  const L = makeLimiter(failing(neonErr({ sourceError: new Error("ECONNRESET") }, "Error connecting to database")), SECRET, { log: (e) => events.push(e) });
  assert.deepEqual(await L.signinAllowed(W), { ok: true });
  assert.deepEqual(await L.signup(W), { ok: true });
  assert.deepEqual(await L.otpSend(W), { ok: true });
  assert.deepEqual(await L.otpVerifyAllowed(W), { ok: true });
  assert.ok(events.filter((e) => e.step === "check").every((e) => e.kind === "transient" && e.decision === "liberado"));
});

test("falha desconhecida: libera só o login; códigos e cadastro recusam", async () => {
  const L = makeLimiter(failing(new Error("algo inesperado")), SECRET, { log: quiet });
  assert.deepEqual(await L.signinAllowed(W), { ok: true });
  for (const d of [await L.signup(W), await L.otpSend(W), await L.otpVerifyAllowed(W)]) assert.deepEqual(d, { ok: false, reason: "unavailable", retryAfter: 60 });
});

test("falha ao registrar depois da ação: só registra, não muda a resposta", async () => {
  const events: LimiterEvent[] = [];
  const m = memoryStore();
  const store: LimitStore = { ...m.store, hit: async () => { throw neonErr({ code: "42501" }); }, clear: async () => { throw neonErr({ code: "42501" }); } };
  const L = makeLimiter(store, SECRET, { log: (e) => events.push(e) });
  await L.signinFailed(W);
  await L.signinSucceeded(W);
  assert.ok(events.length >= 3);
  assert.ok(events.every((e) => e.decision === "sem efeito" && e.kind === "config"));
});

test("ambiente publicado sem IP do cliente: recusa como erro de configuração", async () => {
  const events: LimiterEvent[] = [];
  const m = memoryStore();
  const L = makeLimiter(m.store, SECRET, { requireIp: true, log: (e) => events.push(e) });
  const semIp = { email: "a@x.com", ip: NO_IP };
  assert.deepEqual(await L.signinAllowed(semIp), { ok: false, reason: "unavailable", retryAfter: 60 });
  assert.deepEqual(await L.otpSend(semIp), { ok: false, reason: "unavailable", retryAfter: 60 });
  assert.equal(events[0].error, "LimiterConfigError");
  assert.deepEqual(await L.signinAllowed(W), { ok: true }, "com IP, segue normal");
  // fora de ambiente publicado (desenvolvimento local), IP ausente continua aceito
  const local = makeLimiter(memoryStore().store, SECRET, { log: quiet });
  assert.deepEqual(await local.signinAllowed(semIp), { ok: true });
});

test("o registro nunca leva e-mail, IP ou mensagem do erro", async () => {
  const events: LimiterEvent[] = [];
  const L = makeLimiter(failing(neonErr({ code: "42883" }, "detalhe com a@x.com e 203.0.113.9")), SECRET, { log: (e) => events.push(e) });
  await L.signinAllowed(W);
  const text = JSON.stringify(events);
  assert.ok(!text.includes("a@x.com") && !text.includes("203.0.113.9") && !text.includes("detalhe"), text);
  assert.deepEqual(Object.keys(events[0]).sort(), ["code", "decision", "error", "flow", "kind", "step"]);
});

test("IP exato para consentimento: só endereço válido", () => {
  const get = (h: Record<string, string>) => (n: string) => h[n] ?? null;
  assert.equal(exactIp(get({ "x-real-ip": "203.0.113.7" })), "203.0.113.7");
  assert.equal(exactIp(get({ "x-forwarded-for": "2001:db8::1, 10.0.0.1" })), "2001:db8::1");
  assert.equal(exactIp(get({ "x-forwarded-for": "não é ip" })), null);
  assert.equal(exactIp(get({})), null);
});
