/** Cadastro sem revelar e-mail existente (E3). Rodar: npm run test:auth */
import { test } from "node:test";
import assert from "node:assert/strict";
import { signupFlow, type SignupPort } from "../signup-flow.ts";

const fast = { floorMs: 0, jitterMs: 0, sleep: async () => {} };
function port(result: Awaited<ReturnType<SignupPort["signUp"]>>) {
  const calls = { signUp: 0, verify: 0 };
  const p: SignupPort = {
    async signUp() { calls.signUp++; return result; },
    async sendVerification() { calls.verify++; },
  };
  return { p, calls };
}
const A = { email: "familia@example.com", password: "bola azul na janela", name: "Família Teste", lang: "pt" };

test("conta nova e e-mail já cadastrado: mesma resposta (mesma tela, mesmo endereço)", async () => {
  const novo = port({ ok: true, userId: "u1" });
  const existe = port({ ok: false, kind: "exists" });
  let completed = 0;
  const r1 = await signupFlow(novo.p, A, async () => { completed++; }, fast);
  const r2 = await signupFlow(existe.p, A, async () => { completed++; }, fast);
  assert.deepEqual(r1, r2);
  assert.deepEqual(r1, { kind: "verify", to: "/pt/entrar/verificar?email=familia%40example.com" });
  assert.equal(completed, 1, "só a conta nova grava os dados do cadastro");
  assert.equal(novo.calls.verify + existe.calls.verify, 2, "nos dois casos um código de confirmação é pedido");
});

test("falha ao gravar os dados não muda a resposta (a pessoa conclui depois)", async () => {
  const novo = port({ ok: true, userId: "u1" });
  const r = await signupFlow(novo.p, A, async () => { throw new Error("db"); }, fast);
  assert.equal(r.kind, "verify");
});

test("limite do Neon Auth e outros erros aparecem como erro (não como cadastro)", async () => {
  assert.deepEqual(await signupFlow(port({ ok: false, kind: "rate_limited" }).p, A, async () => {}, fast), { kind: "error", error: "tooMany" });
  assert.deepEqual(await signupFlow(port({ ok: false, kind: "other" }).p, A, async () => {}, fast), { kind: "error", error: "generic" });
});

test("tempo mínimo igual para conta nova e e-mail existente", async () => {
  const slept: number[] = [];
  const timing = { floorMs: 1800, jitterMs: 0, sleep: async (ms: number) => { slept.push(ms); } };
  await signupFlow(port({ ok: true, userId: "u1" }).p, A, async () => {}, timing);
  await signupFlow(port({ ok: false, kind: "exists" }).p, A, async () => {}, timing);
  assert.equal(slept.length, 2);
  assert.ok(slept.every((ms) => ms > 1700 && ms <= 1800), JSON.stringify(slept));
});

test("falha no envio do código não revela nada nem quebra o cadastro", async () => {
  const p: SignupPort = { async signUp() { return { ok: false, kind: "exists" }; }, async sendVerification() { throw new Error("x"); } };
  assert.equal((await signupFlow(p, A, async () => {}, fast)).kind, "verify");
});
