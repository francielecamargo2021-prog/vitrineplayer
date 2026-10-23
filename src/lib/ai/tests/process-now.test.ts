/** "Processar agora" (chamada direta) — Gemini simulado, sem rede e sem custo. Rodar: npm run test:ai */
import { test } from "node:test";
import assert from "node:assert/strict";
import { processNow } from "../pipeline.ts";
import { DIRECT_MAX_OUTPUT_TOKENS, DIRECT_MAX_USD, directMaxCost } from "../pricing.ts";
import type { DirectClient, ModelInfo } from "../gemini.ts";
import { GeminiDirectClient } from "../gemini.ts";
import { MemoryRepo, modelResponse, request, settings, strikerOutput } from "./fakes.ts";

const NOW = new Date("2026-10-23T12:00:00Z");

class FakeDirect implements DirectClient {
  calls: { model: string; request: unknown; timeoutMs: number }[] = [];
  modelChecks: string[] = [];
  respond: () => unknown;
  models: Record<string, ModelInfo | null>;
  constructor(
    respond: () => unknown = () => modelResponse(strikerOutput()),
    models: Record<string, ModelInfo | null> = { "gemini-3.8-flash": { name: "models/gemini-3.8-flash", methods: ["generateContent", "batchGenerateContent"] } },
  ) {
    this.respond = respond;
    this.models = models;
  }
  async getModel(model: string) { this.modelChecks.push(model); return this.models[model] ?? null; }
  async generate(model: string, req: unknown, opts: { timeoutMs: number }) {
    this.calls.push({ model, request: req, timeoutMs: opts.timeoutMs });
    return this.respond();
  }
}

const setup = (over: Parameters<typeof request>[0] = {}, s = settings()) => {
  const repo = new MemoryRepo(s);
  const r = repo.add(request(over));
  return { repo, r };
};

test("processar agora: melhores momentos curtos geram o relatório na hora, com custo real a preço cheio", async () => {
  const { repo, r } = setup();
  const client = new FakeDirect();
  const out = await processNow({ repo, client, paidAllowed: true, requestId: r.id, now: NOW });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.status, "completed");
  assert.equal(repo.reports.length, 1);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].model, "gemini-3.8-flash");
  const cfg = (client.calls[0].request as { generationConfig: { maxOutputTokens: number } }).generationConfig;
  assert.equal(cfg.maxOutputTokens, DIRECT_MAX_OUTPUT_TOKENS, "teto de saída limita o custo");
  // 60k entrada + 9k saída a US$ 0,75 / 3,75 por milhão, sem desconto de lote
  assert.equal(out.costUsd, 0.0788);
  const batch = [...repo.batches.values()][0];
  assert.equal(batch.provider_name, `direct:${batch.id}`);
  assert.equal(batch.status, "succeeded");
  assert.deepEqual(repo.notifications.map((n) => n.template), ["ai_report_ready"]);
});

test("as três travas valem: banco, ambiente e chave — nada é chamado", async () => {
  for (const [s, paid, client, reason] of [
    [settings({ enabled: false }), true, new FakeDirect(), "disabled_in_settings"],
    [settings(), false, new FakeDirect(), "disabled_in_environment"],
    [settings(), true, null, "no_api_key"],
  ] as const) {
    const { repo, r } = setup({}, s);
    const out = await processNow({ repo, client, paidAllowed: paid, requestId: r.id, now: NOW });
    assert.deepEqual(out, { ok: false, reason });
    assert.equal(client?.calls.length ?? 0, 0);
  }
});

test("só melhores momentos de até 10 minutos; partida completa e vídeo longo continuam no lote", async () => {
  const client = new FakeDirect();
  const full = setup({ video_type: "full_match", video_minutes: 8 });
  assert.equal((await processNow({ repo: full.repo, client, paidAllowed: true, requestId: full.r.id, now: NOW })).ok, false);
  const long = setup({ video_minutes: 12 });
  const outLong = await processNow({ repo: long.repo, client, paidAllowed: true, requestId: long.r.id, now: NOW });
  assert.equal(outLong.ok ? "" : outLong.reason, "too_long");
  const trimmed = setup({ video_minutes: 30, range_start_s: 120, range_end_s: 660 }); // trecho de 9 min
  assert.equal((await processNow({ repo: trimmed.repo, client, paidAllowed: true, requestId: trimmed.r.id, now: NOW })).ok, true);
  assert.equal(client.calls.length, 1);
});

test("pedido que não está na fila não é processado (concluído, cancelado, inexistente)", async () => {
  const client = new FakeDirect();
  const done = setup({ status: "completed" });
  const out = await processNow({ repo: done.repo, client, paidAllowed: true, requestId: done.r.id, now: NOW });
  assert.equal(out.ok ? "" : out.reason, "not_queued");
  const none = setup();
  assert.equal((await processNow({ repo: none.repo, client, paidAllowed: true, requestId: "nao-existe", now: NOW })).ok, false);
  assert.equal(client.calls.length, 0);
});

test("modelo: usa exatamente o configurado; indisponível → recusa sem trocar de modelo", async () => {
  const { repo, r } = setup();
  const client = new FakeDirect(undefined, {});
  const out = await processNow({ repo, client, paidAllowed: true, requestId: r.id, now: NOW });
  assert.equal(out.ok ? "" : out.reason, "model_unavailable");
  assert.deepEqual(client.modelChecks, ["gemini-3.8-flash"]);
  assert.equal(client.calls.length, 0);
  const mismatch = setup({ model: "gemini-4-argon" });
  const out2 = await processNow({ repo: mismatch.repo, client: new FakeDirect(), paidAllowed: true, requestId: mismatch.r.id, now: NOW });
  assert.equal(out2.ok ? "" : out2.reason, "model_mismatch");
});

test("custo: teto por chamada e orçamento diário conferidos ANTES de chamar", async () => {
  const max = directMaxCost("gemini-3.8-flash", 600, 2, NOW).costUsd;
  assert.ok(max > 0.3 && max <= DIRECT_MAX_USD, `custo máximo de 10 min = US$ ${max}`);
  const poor = setup({}, settings({ daily_budget_usd: 0.05 }));
  const client = new FakeDirect();
  const out = await processNow({ repo: poor.repo, client, paidAllowed: true, requestId: poor.r.id, now: NOW });
  assert.equal(out.ok ? "" : out.reason, "budget_exhausted");
  assert.equal(client.calls.length, 0);
  const pricey = setup({ model: "gemini-4-argon" }, settings({ model: "gemini-4-argon" }));
  const out2 = await processNow({ repo: pricey.repo, client: new FakeDirect(), paidAllowed: true, requestId: pricey.r.id, now: NOW });
  assert.equal(out2.ok ? "" : out2.reason, "over_cost_cap", "10 min no modelo mais caro passa do teto de US$ 0,50");
});

test("falha ou tempo esgotado do Gemini: pedido não conclui, item volta para nova tentativa e o lote fica como falha", async () => {
  const { repo, r } = setup();
  const client = new FakeDirect(() => { throw new Error("TimeoutError"); });
  const out = await processNow({ repo, client, paidAllowed: true, requestId: r.id, now: NOW });
  assert.equal(out.ok ? "" : out.reason, "provider_error");
  assert.equal(repo.reports.length, 0);
  const job = [...repo.jobs.values()][0];
  assert.equal(job.status, "pending");
  assert.equal([...repo.batches.values()][0].status, "failed");
});

test("atleta não identificado no vídeo: nenhuma nota é dada", async () => {
  const { repo, r } = setup();
  const client = new FakeDirect(() => modelResponse(strikerOutput({ identification: { status: "not_found", notes: "camisa 10 azul não aparece", timestamps: [] } })));
  const out = await processNow({ repo, client, paidAllowed: true, requestId: r.id, now: NOW });
  assert.equal(out.ok && out.status, "unidentified");
  assert.equal(repo.reports.length, 0);
  assert.deepEqual(repo.notifications.map((n) => n.template), ["ai_analysis_unidentified"]);
});

test("dois cliques ao mesmo tempo: só uma chamada ao Gemini", async () => {
  const { repo, r } = setup();
  const client = new FakeDirect();
  const outs = await Promise.all([1, 2].map(() => processNow({ repo, client, paidAllowed: true, requestId: r.id, now: NOW })));
  assert.equal(client.calls.length, 1);
  assert.equal(outs.filter((o) => o.ok).length, 1);
});

test("cliente direto real: só existe com autorização de custo e manda a chave em cabeçalho (nunca na URL)", async () => {
  assert.throws(() => new GeminiDirectClient({ apiKey: "k", allowPaid: false }));
  const seen: { url: string; key: string | null }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    seen.push({ url, key: new Headers(init?.headers).get("x-goog-api-key") });
    return url.includes(":generateContent")
      ? new Response(JSON.stringify(modelResponse(strikerOutput())), { status: 200 })
      : new Response(JSON.stringify({ name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] }), { status: 200 });
  }) as unknown as typeof fetch;
  const c = new GeminiDirectClient({ apiKey: "chave-teste", allowPaid: true, fetchImpl });
  assert.deepEqual((await c.getModel("gemini-3.8-flash"))?.methods, ["generateContent"]);
  assert.equal(await c.getModel("../x"), null, "nome de modelo inválido não vira URL");
  await c.generate("gemini-3.8-flash", {}, { timeoutMs: 1000 });
  assert.ok(seen.every((s) => s.key === "chave-teste" && !s.url.includes("chave-teste")));
});
