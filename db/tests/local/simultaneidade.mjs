// Pedidos SIMULTÂNEOS contra o Postgres local (chamado por run.sh, depois das migrations).
// Usa o MESMO SQL do app (src/lib/auth/limit-sql.ts), as MESMAS regras (limits.ts) e o MESMO
// fluxo de entrada (signin-flow.ts); só o Neon Auth é simulado. Cada pedido usa a sua própria
// conexão, como instâncias serverless diferentes.
//   VP_DB_URL=postgresql://neondb_owner@localhost:PORTA/vp?host=… node db/tests/local/simultaneidade.mjs
import pg from "pg";
import { LIMIT_SQL } from "../../../src/lib/auth/limit-sql.ts";
import { GUARD_LIMIT, RULES, deriveKey, makeLimiter, newDeviceToken } from "../../../src/lib/auth/limits.ts";
import { codeSignIn, passwordSignIn, sendCodeFlow } from "../../../src/lib/auth/signin-flow.ts";

const N = 50;
const pool = new pg.Pool({ connectionString: process.env.VP_DB_URL, max: N + 5 });
const SECRET = "s".repeat(48);

/** Uma transação por chamada, com o papel de serviço (como asService no app). */
async function call(text, params) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    const r = await c.query(text, params);
    await c.query("commit");
    return r.rows;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
const first = (rows) => rows[0].r;
const store = {
  consume: async (items) => first(await call(LIMIT_SQL.consume, [JSON.stringify(items)])),
  refund: async (keys) => void (await call(LIMIT_SQL.refund, [keys])),
  clear: async (keys) => void (await call(LIMIT_SQL.clear, [keys])),
  guardBegin: async (a, t) => first(await call(LIMIT_SQL.guardBegin, [a, t])),
  guardSuccess: async (a) => void (await call(LIMIT_SQL.guardSuccess, [a])),
  deviceCheck: async (a, h) => first(await call(LIMIT_SQL.deviceCheck, [a, h])),
  deviceRegister: async (a, h, d) => void (await call(LIMIT_SQL.deviceRegister, [a, h, d])),
  deviceRevokeAll: async (a) => void (await call(LIMIT_SQL.deviceRevokeAll, [a])),
  sendCooldown: async (k) => first(await call(LIMIT_SQL.sendCooldown, [k])),
};
const errors = [];
const L = makeLimiter(store, SECRET, { log: (e) => errors.push(e) });

let failed = 0;
const check = (ok, msg, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${msg}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};
const reset = () => call("delete from auth_attempts; delete from auth_account_guard; delete from auth_devices; delete from auth_send_cooldown");

/** Neon Auth falso: conta quantas senhas chegaram a ser conferidas. */
function fakeAuth() {
  const seen = { password: 0, sends: 0, codes: 0 };
  return {
    seen,
    port: {
      async signInPassword(email, password) { seen.password++; await new Promise((r) => setTimeout(r, 5)); return password === "certa-123456" ? { ok: true, emailVerified: true } : { ok: false, kind: "invalid" }; },
      async sendCode() { seen.sends++; return "ok"; },
      async signInCode(email, otp) { seen.codes++; return otp === "123456" ? { ok: true } : { ok: false, kind: "code" }; },
    },
  };
}
const ips = (n, base = "198.51.100.") => Array.from({ length: n }, (_, i) => `${base}${i + 1}`);

// 1. SQL puro: 50 consumos simultâneos da mesma chave, limite 5
await reset();
{
  const key = deriveKey(SECRET, "teste", "x");
  const item = { key, scope: "signin_pair", max: 5, window: 900, block: 900, escalate: false };
  const rs = await Promise.all(Array.from({ length: N }, () => store.consume([item])));
  const passed = rs.filter((r) => !r.blocked).length;
  check(passed === 5, `${N} consumos simultâneos da mesma regra (limite 5): passam exatamente 5`, `passaram ${passed}`);
}

// 2. SQL puro: 50 pedidos simultâneos com duas regras em ordens diferentes (sem impasse)
await reset();
{
  const a = { key: deriveKey(SECRET, "t", "a"), scope: "signin_ip", max: 30, window: 900, block: 900, escalate: false };
  const b = { key: deriveKey(SECRET, "t", "b"), scope: "signin_pair", max: 30, window: 900, block: 900, escalate: false };
  const rs = await Promise.all(Array.from({ length: N }, (_, i) => store.consume(i % 2 ? [a, b] : [b, a])));
  const rows = await call("select key, blocked_until > now() as blocked from auth_attempts where key = any($1)", [[a.key, b.key]]);
  // a 31ª tentativa estoura as duas regras ao mesmo tempo: as duas ficam bloqueadas (e a contagem recomeça)
  check(rs.filter((r) => !r.blocked).length === 30 && rows.length === 2 && rows.every((r) => r.blocked),
    `${N} pedidos com 2 regras em ordens opostas: sem impasse, exatamente 30 passam`, `passaram ${rs.filter((r) => !r.blocked).length}`);
}

// 3. Fluxo completo: 50 senhas simultâneas para a mesma conta, de 50 IPs e aparelhos diferentes
await reset();
{
  const f = fakeAuth();
  const rs = await Promise.all(ips(N).map((ip) => passwordSignIn(L, f.port, { email: "familia@x.com", password: "chute", ip, deviceToken: newDeviceToken() })));
  check(f.seen.password === GUARD_LIMIT.unknownDevice, `${N} senhas simultâneas (IPs e aparelhos diferentes): só ${GUARD_LIMIT.unknownDevice} chegam a ser conferidas`, `conferidas ${f.seen.password}`);
  const tally = rs.reduce((m, r) => { const k = r.kind === "error" ? r.error : r.kind; return { ...m, [k]: (m[k] ?? 0) + 1 }; }, {});
  // As demais: desafio por código, ou — depois de 10 por e-mail em 1 h — o limite atual de 0013 (provisório, sai na E3b)
  check(tally.invalid === GUARD_LIMIT.unknownDevice && (tally.challenge ?? 0) + (tally.tooMany ?? 0) === N - GUARD_LIMIT.unknownDevice,
    "as demais recebem o desafio por código ou o limite atual por e-mail (provisório); nenhuma senha a mais é conferida", JSON.stringify(tally));
}

// 4. Fluxo completo: 50 senhas simultâneas do MESMO IP (limite atual e-mail+IP, provisório)
await reset();
{
  const f = fakeAuth();
  await Promise.all(Array.from({ length: N }, () => passwordSignIn(L, f.port, { email: "familia@x.com", password: "chute", ip: "203.0.113.5" })));
  check(f.seen.password <= RULES.signin_pair.max, `${N} senhas simultâneas do mesmo IP: no máximo ${RULES.signin_pair.max} conferidas`, `conferidas ${f.seen.password}`);
}

// 5. Aparelho reconhecido sob ataque simultâneo: a família entra; o ataque não passa de 10
await reset();
{
  const f = fakeAuth();
  const token = newDeviceToken();
  await L.rememberDevice("familia@x.com", token);
  await Promise.all(ips(N, "192.0.2.").map((ip) => passwordSignIn(L, f.port, { email: "familia@x.com", password: "chute", ip })));
  const r = await passwordSignIn(L, f.port, { email: "familia@x.com", password: "certa-123456", ip: "203.0.113.77", deviceToken: token });
  check(r.kind === "ok", "durante o ataque, a família entra com a senha no aparelho dela", r.kind);
  const f2 = fakeAuth();
  await Promise.all(ips(N, "198.18.0.").map((ip) => passwordSignIn(L, f2.port, { email: "familia@x.com", password: "chute", ip, deviceToken: token })));
  check(f2.seen.password === GUARD_LIMIT.knownDevice, `${N} tentativas simultâneas com o token do aparelho: só ${GUARD_LIMIT.knownDevice} conferidas`, `conferidas ${f2.seen.password}`);
}

// 6. Pedidos de código simultâneos para o mesmo e-mail: só 1 envio
await reset();
{
  const f = fakeAuth();
  const rs = await Promise.all(ips(N).map((ip) => sendCodeFlow(L, f.port, { email: "familia@x.com", ip }, "sign-in")));
  check(f.seen.sends === 1 && rs.filter((r) => r === "wait").length === N - 1, `${N} pedidos de código simultâneos para o mesmo e-mail: 1 envio, ${N - 1} aguardam`, `envios ${f.seen.sends}`);
  const other = await sendCodeFlow(L, f.port, { email: "vizinho@x.com", ip: "198.51.100.1" }, "sign-in");
  check(other === null, "outra família na mesma rede recebe o código normalmente");
}

// 7. Códigos simultâneos (adivinhação): no máximo o limite atual por e-mail é conferido
await reset();
{
  const f = fakeAuth();
  await Promise.all(ips(N).map((ip, i) => codeSignIn(L, f.port, { email: "familia@x.com", code: String(100000 + i), ip })));
  check(f.seen.codes <= RULES.otp_verify_email.max, `${N} códigos simultâneos: no máximo ${RULES.otp_verify_email.max} conferidos`, `conferidos ${f.seen.codes}`);
}

await reset();
check(errors.length === 0, "nenhuma falha do banco durante os testes", JSON.stringify(errors.slice(0, 2)));
await pool.end();
console.log(failed ? `\n${failed} falha(s) de simultaneidade` : "\nSimultaneidade: tudo ok");
process.exit(failed ? 1 : 0);
