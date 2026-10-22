/** BotID nas ações de autenticação (E3). Rodar: npm run test:auth */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { makeBotGate, type BotEvent } from "../bot-gate.ts";
import { BOT_PROTECTED_PATHS } from "../bot-paths.ts";

const gate = (check: () => Promise<{ isBot: boolean }>, onVercel = true) => {
  const events: BotEvent[] = [];
  return { events, g: makeBotGate({ onVercel, check, log: (e) => events.push(e), timeoutMs: 50 }) };
};

test("na Vercel: humano segue, robô é recusado em todos os fluxos", async () => {
  const human = gate(async () => ({ isBot: false }));
  const bot = gate(async () => ({ isBot: true }));
  for (const f of ["signup", "signin", "code", "reset"] as const) {
    assert.deepEqual(await human.g(f), { ok: true });
    assert.deepEqual(await bot.g(f), { ok: false, reason: "bot" });
  }
  assert.equal(bot.events.filter((e) => e.outcome === "bot").length, 4);
});

test("falha do BotID: cadastro recusado (indisponível); entrar, códigos e recuperação seguem com registro", async () => {
  const broken = gate(async () => { throw new Error("VERCEL_OIDC_TOKEN is not set"); });
  assert.deepEqual(await broken.g("signup"), { ok: false, reason: "unavailable" });
  for (const f of ["signin", "code", "reset"] as const) assert.deepEqual(await broken.g(f), { ok: true });
  assert.ok(broken.events.every((e) => e.outcome === "error" && e.detail === "Error"), "registra só o tipo do erro");
});

test("BotID lento demais conta como falha (tempo máximo)", async () => {
  const slow = gate(() => new Promise((r) => setTimeout(() => r({ isBot: false }), 500)));
  assert.deepEqual(await slow.g("signup"), { ok: false, reason: "unavailable" });
  assert.deepEqual(await slow.g("signin"), { ok: true });
  assert.equal(slow.events[0].detail, "TimeoutError");
});

test("fora da Vercel o BotID não é consultado (e o registro aparece uma vez)", async () => {
  let calls = 0;
  const local = gate(async () => { calls++; return { isBot: true }; }, false);
  assert.deepEqual(await local.g("signin"), { ok: true });
  assert.deepEqual(await local.g("signup"), { ok: true });
  assert.equal(calls, 0);
  assert.equal(local.events.length, 1);
});

test("os registros não levam e-mail, IP nem mensagem do erro", async () => {
  const broken = gate(async () => { throw new Error("falha para maria@example.com 203.0.113.9"); });
  await broken.g("signin");
  assert.doesNotMatch(JSON.stringify(broken.events), /@|203\.0/);
});

// ---- cobertura: toda página com ação de autenticação precisa estar na lista do navegador
const ACTIONS = /\b(signUp|signIn|requestPasswordReset|resetPassword|resendVerification|verifyEmail|proSignUp|proJoinSignUp)\b/;
const app = join(import.meta.dirname, "..", "..", "..", "app");
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? pages(p) : n === "page.tsx" ? [p] : [];
  });
}
const toRegex = (path: string) => new RegExp(`^${path.replace(/[.?+^$[\]\\(){}|-]/g, "\\$&").split("*").join(".*")}$`);

test("toda página que usa ações de autenticação está protegida pelo BotID no navegador", () => {
  const found = pages(app).filter((p) => ACTIONS.test(readFileSync(p, "utf8")));
  assert.ok(found.length >= 6, `páginas encontradas: ${found.length}`);
  for (const file of found) {
    const route = file.slice(app.length).replace(/\/page\.tsx$/, "").replace(/\[lang\]/, "pt").replace(/\[[^\]]+\]/g, "abc123");
    assert.ok(BOT_PROTECTED_PATHS.some((p) => toRegex(p).test(route)), `sem proteção do BotID: ${route}`);
  }
});

test("a lista do navegador não cobre páginas fora da autenticação (painel, portal, admin)", () => {
  for (const route of ["/pt/painel", "/pt/portal", "/pt/admin", "/pt", "/es/portal/atletas/x"]) {
    assert.ok(!BOT_PROTECTED_PATHS.some((p) => toRegex(p).test(route)), route);
  }
});
