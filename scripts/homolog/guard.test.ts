import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./verificar-api.ts", import.meta.url));
const base = { PATH: process.env.PATH ?? "" };
const ref = "abcdefghijklmnopqrst";
const ok = { ...base, VP_ENV: "homolog", HOMOLOG_SUPABASE_REF: ref, NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "x" };
const run = (env: Record<string, string>) => spawnSync(process.execPath, [script], { env: env as NodeJS.ProcessEnv, encoding: "utf8", timeout: 5000 });

test("recusa sem VP_ENV=homolog", () => {
  const r = run({ ...ok, VP_ENV: "production" });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /VP_ENV/);
});
test("recusa quando a URL aponta para outro projeto", () => {
  const r = run({ ...ok, NEXT_PUBLIC_SUPABASE_URL: "https://outroprojeto123456789.supabase.co" });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /não é o projeto de homologação/);
});
test("recusa se existir chave do Gemini ou IA ligada no ambiente", () => {
  assert.match(run({ ...ok, GEMINI_API_KEY: "k" }).stderr, /GEMINI_API_KEY/);
  assert.match(run({ ...ok, AI_ANALYSIS_ENABLED: "true" }).stderr, /AI_ANALYSIS_ENABLED/);
});
