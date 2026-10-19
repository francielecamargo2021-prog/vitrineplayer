/**
 * Testes do pipeline de avaliação por IA — 100% simulados (sem rede, sem custo).
 * Rodar: npm run test:ai
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { criteria, groupFor, groupKeys, groups, type Position } from "../rubric.ts";
import { planJobs } from "../planner.ts";
import { costFromUsage, costUsd, estimateJob, priceFor } from "../pricing.ts";
import { InvalidOutput, buildReport, parseModelOutput, parseTimestamp, responseText } from "../report.ts";
import { buildConsolidateRequest, buildVideoRequest } from "../prompt.ts";
import { runCycle } from "../pipeline.ts";
import { GeminiBatchClient, parseBatch } from "../gemini.ts";
import { FakeGemini, MemoryRepo, modelResponse, request, settings, strikerOutput } from "./fakes.ts";

const H = 3_600_000;
const T0 = new Date("2026-11-10T12:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

// ---------------------------------------------------------------- rubrica
test("rubrica: toda posição tem grupo e todo fundamento existe no catálogo", () => {
  const all: Position[] = ["GK", "RB", "CB", "LB", "DM", "CM", "AM", "RW", "LW", "CF", "ST"];
  for (const p of all) {
    const keys = groupKeys(groupFor(p));
    assert.ok(keys.length >= 5, p);
    for (const k of keys) {
      assert.ok(criteria[k], `${k} no catálogo`);
      assert.ok((groups[groupFor(p)].weights[k] ?? 0) > 0);
    }
  }
  assert.equal(groupFor("GK"), "gk");
  assert.equal(groupFor("LB"), "fb");
  assert.equal(groupFor("AM"), "mid");
});

// ---------------------------------------------------------------- planejamento
test("planejamento: vídeo curto = 1 item a 2 fps; partida de 90 min = 6 trechos de 15 min", () => {
  const short = planJobs({ video_type: "highlights", video_minutes: 4, range_start_s: null, range_end_s: null }, 15);
  assert.deepEqual(short, [{ kind: "analyze", seq: 0, start_s: 0, end_s: 240, fps: 2 }]);

  const match = planJobs({ video_type: "full_match", video_minutes: 90, range_start_s: null, range_end_s: null }, 15);
  assert.equal(match.length, 6);
  assert.ok(match.every((j) => j.kind === "segment" && j.fps === 1 && j.end_s - j.start_s === 900));
  assert.equal(match[5].end_s, 5400);

  const range = planJobs({ video_type: "full_match", video_minutes: 90, range_start_s: 1800, range_end_s: 3300 }, 15);
  assert.deepEqual(range.map((j) => [j.start_s, j.end_s]), [[1800, 2700], [2700, 3300]]);

  const tolerance = planJobs({ video_type: "training", video_minutes: 17, range_start_s: null, range_end_s: null }, 15);
  assert.equal(tolerance.length, 1, "até 20% acima do trecho continua análise única");
});

// ---------------------------------------------------------------- preços
test("preços: promoção até 31/12/2026, preço cheio em 2027, lote com 50%", () => {
  assert.equal(priceFor("gemini-3.8-flash", new Date("2026-12-31")).input, 0.75);
  assert.equal(priceFor("gemini-3.8-flash", new Date("2027-01-01")).input, 1.5);
  assert.equal(costUsd("gemini-3.8-flash", 1_000_000, 0, { at: new Date("2027-02-01") }), 0.75, "lote = metade de US$ 1,50");
  assert.equal(costUsd("gemini-3.8-flash", 1_000_000, 0, { at: new Date("2027-02-01"), batch: false }), 1.5);
  const u = costFromUsage("gemini-3.8-flash", { promptTokenCount: 100_000, candidatesTokenCount: 4000, thoughtsTokenCount: 6000 }, new Date("2027-02-01"));
  assert.equal(u.outputTokens, 10_000, "raciocínio conta como saída");
  const est = estimateJob("gemini-3.8-flash", { kind: "analyze", start_s: 0, end_s: 180, fps: 2 }, new Date("2027-02-01"));
  assert.ok(est.costUsd > 0.1 && est.costUsd < 0.2, `3 min em lote ≈ US$ 0,14 (estimado ${est.costUsd})`);
});

// ---------------------------------------------------------------- validação e notas
const keysST = groupKeys("st");
const r4 = () => request({ video_minutes: 4 });

test("relatório: só conta fundamento com 2+ lances; nota geral ponderada; melhores momentos limitam a confiança", () => {
  const out = parseModelOutput(JSON.stringify(strikerOutput()), keysST, { start: 0, end: 240 });
  const outcome = buildReport(out, r4(), { start_s: 0, end_s: 240, segments: 1 });
  assert.equal(outcome.kind, "report");
  if (outcome.kind !== "report") return;
  const rep = outcome.report;
  // contam: finishing(3) movement(3) first_touch(2) decision(1) = 9 de 13
  assert.equal(rep.coverage, 0.69);
  assert.equal(rep.overall_score, 3.7);
  assert.equal(rep.confidence, "medium", "melhores momentos nunca passam de média");
  assert.deepEqual(rep.scores.map((s) => s.criterion).sort(), ["decision_making", "finishing", "first_touch", "off_ball_movement"]);
  const link = rep.report.criteria.find((c) => c.key === "link_play")!;
  assert.equal(link.score, null, "1 lance só não gera nota");
  assert.equal(link.counted, false);
});

test("relatório: sem cobertura mínima não há nota geral; atleta não identificado não gera avaliação", () => {
  const few = strikerOutput({
    criteria: [{ key: "finishing", observed: true, score: 5, confidence: "high", evidence: [{ t: "00:10", note: "a" }, { t: "00:20", note: "b" }], comment: "" }],
  });
  const out = parseModelOutput(JSON.stringify(few), keysST, { start: 0, end: 240 });
  const rep = buildReport(out, request({ video_type: "full_match", video_minutes: 4 }), { start_s: 0, end_s: 240, segments: 1 });
  assert.equal(rep.kind === "report" && rep.report.overall_score, null);
  assert.equal(rep.kind === "report" && rep.report.confidence, "low");

  const unknown = parseModelOutput(JSON.stringify(strikerOutput({ identification: { status: "uncertain", notes: "dois camisas 10", timestamps: [] } })), keysST, { start: 0, end: 240 });
  assert.equal(buildReport(unknown, r4(), { start_s: 0, end_s: 240, segments: 1 }).kind, "unidentified");
});

test("validação: descarta evidência fora do trecho, fundamento fora da rubrica e completa os omitidos", () => {
  const o = strikerOutput({
    criteria: [
      { key: "finishing", observed: true, score: 4, confidence: "high", evidence: [{ t: "00:20", note: "ok" }, { t: "09:00", note: "fora do vídeo" }], comment: "" },
      { key: "shot_stopping", observed: true, score: 5, confidence: "high", evidence: [{ t: "00:30", note: "x" }, { t: "00:40", note: "y" }], comment: "não é desta posição" },
    ],
  });
  const out = parseModelOutput(JSON.stringify(o), keysST, { start: 0, end: 240 });
  assert.equal(out.criteria.length, keysST.length);
  assert.equal(out.criteria.find((c) => c.key === "finishing")!.evidence.length, 1);
  assert.ok(!out.criteria.some((c) => (c.key as string) === "shot_stopping"));
  assert.throws(() => parseModelOutput("{não é json", keysST, { start: 0, end: 240 }), InvalidOutput);
  assert.throws(() => responseText({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] }), InvalidOutput);
  assert.equal(parseTimestamp("1:05:09"), 3909);
  assert.equal(parseTimestamp("12:61"), null);
});

// ---------------------------------------------------------------- prompt
test("prompt: YouTube público recortado, esquema da posição, sem dados pessoais do atleta", () => {
  const r = request({ position: "GK", video_minutes: 10 });
  const body = buildVideoRequest(r, { kind: "analyze", seq: 0, start_s: 0, end_s: 600, fps: 2 }, 0);
  const json = JSON.stringify(body);
  assert.match(json, /https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ/);
  assert.match(json, /"startOffset":"0s","endOffset":"600s","fps":2/);
  assert.match(json, /MEDIA_RESOLUTION_HIGH/);
  assert.deepEqual(body.generationConfig.responseJsonSchema.properties.criteria.items.properties.key.enum, groupKeys("gk"));
  assert.ok(!json.includes(r.athlete_id) && !json.includes(r.id), "nenhum identificador interno vai ao provedor");
  assert.match(json, /nunca por reconhecimento facial/);
  const cons = JSON.stringify(buildConsolidateRequest(r, [{ seq: 0, start_s: 0, end_s: 600, output: parseModelOutput(JSON.stringify(strikerOutput()), keysST, { start: 0, end: 600 }) }]));
  assert.ok(!cons.includes("fileData"), "consolidação é só texto (barata)");
});

test("cliente real: recusa ser criado sem autorização explícita de custo", () => {
  assert.throws(() => new GeminiBatchClient({ apiKey: "x", allowPaid: false }), /não autorizadas/);
  assert.throws(() => new GeminiBatchClient({ apiKey: "", allowPaid: true }), /GEMINI_API_KEY/);
  const info = parseBatch({ name: "batches/1", metadata: { state: "JOB_STATE_SUCCEEDED" }, done: true,
    response: { inlinedResponses: { inlinedResponses: [{ response: { candidates: [] }, metadata: { key: "job-1" } }] } } });
  assert.equal(info.state, "succeeded");
  assert.equal(info.results?.[0].key, "job-1");
});

// ---------------------------------------------------------------- pipeline
function setup(over = {}) {
  const repo = new MemoryRepo(settings(over));
  repo.clock = () => T0.toISOString();
  const gemini = new FakeGemini();
  return { repo, gemini };
}

test("pipeline: desligado no banco ou no ambiente → planeja, mas não envia nada", async () => {
  const { repo, gemini } = setup({ enabled: false });
  repo.add(r4());
  const s1 = await runCycle({ repo, client: gemini, paidAllowed: true, now: at(7 * H) });
  assert.equal(s1.skipped, "disabled_in_settings");
  assert.equal(s1.planned, 1);
  assert.equal(gemini.created.length, 0);

  repo.s.enabled = true;
  const s2 = await runCycle({ repo, client: gemini, paidAllowed: false, now: at(7 * H) });
  assert.equal(s2.skipped, "disabled_in_environment");
  assert.equal(gemini.created.length, 0);
});

test("pipeline: espera a janela do lote; envia após max_wait_hours; associa resultado ao atleta e notifica", async () => {
  const { repo, gemini } = setup();
  const r = repo.add(r4());
  const s1 = await runCycle({ repo, client: gemini, paidAllowed: true, now: at(1 * H) });
  assert.equal(s1.skipped, "waiting_for_batch_window");

  const s2 = await runCycle({ repo, client: gemini, paidAllowed: true, now: at(7 * H) });
  assert.equal(s2.submitted, 1);
  assert.equal(gemini.created.length, 1);
  const job = [...repo.jobs.values()][0];
  assert.equal(gemini.created[0].items[0].key, job.id, "chave do item = id do item no banco");
  assert.equal(repo.requests.get(r.id)!.status, "processing");

  gemini.finish(gemini.created[0].name, () => modelResponse(strikerOutput()));
  const s3 = await runCycle({ repo, client: gemini, paidAllowed: true, now: at(9 * H) });
  assert.equal(s3.applied, 1);
  assert.equal(repo.requests.get(r.id)!.status, "completed");
  assert.equal(repo.reports.length, 1);
  assert.equal(repo.reports[0].athlete_id, r.athlete_id);
  assert.equal(repo.reports[0].media_id, r.media_id);
  assert.deepEqual(repo.notifications.map((n) => n.template), ["ai_report_ready"]);
  // custo real: 60k entrada + 9k saída, preço promocional de lote (nov/2026)
  assert.equal(repo.requests.get(r.id)!.cost_usd, costUsd("gemini-3.8-flash", 60000, 9000, { at: at(9 * H) }));

  // novo ciclo não duplica nada
  await runCycle({ repo, client: gemini, paidAllowed: true, now: at(10 * H) });
  assert.equal(repo.reports.length, 1);
  assert.equal(gemini.created.length, 1);
});

test("pipeline: lote cheio é enviado na hora; vários atletas, uma análise por atleta", async () => {
  const { repo, gemini } = setup({ max_items_per_batch: 3 });
  const rs = [repo.add(r4()), repo.add(r4()), repo.add(r4())];
  await runCycle({ repo, client: gemini, paidAllowed: true, now: at(0) });
  assert.equal(gemini.created.length, 1);
  assert.equal(gemini.created[0].items.length, 3);
  gemini.finish(gemini.created[0].name, () => modelResponse(strikerOutput()));
  await runCycle({ repo, client: gemini, paidAllowed: true, now: at(1 * H) });
  assert.deepEqual(rs.map((r) => repo.reports.filter((x) => x.athlete_id === r.athlete_id).length), [1, 1, 1]);
});

test("pipeline: atleta não identificado → sem relatório, responsável avisado", async () => {
  const { repo, gemini } = setup({ max_wait_hours: 0 });
  const r = repo.add(r4());
  await runCycle({ repo, client: gemini, paidAllowed: true, now: at(0) });
  gemini.finish(gemini.created[0].name, () => modelResponse(strikerOutput({ identification: { status: "not_found", notes: "camisa não visível", timestamps: [] } })));
  await runCycle({ repo, client: gemini, paidAllowed: true, now: at(1 * H) });
  assert.equal(repo.requests.get(r.id)!.status, "unidentified");
  assert.equal(repo.reports.length, 0);
  assert.deepEqual(repo.notifications.map((n) => n.template), ["ai_analysis_unidentified"]);
});

test("pipeline: erro do provedor e saída inválida → nova tentativa; esgotou → pedido falha (custo registrado)", async () => {
  const { repo, gemini } = setup({ max_wait_hours: 0, max_attempts: 2 });
  const r = repo.add(r4());
  await runCycle({ repo, client: gemini, paidAllowed: true, now: at(0) });
  gemini.finish(gemini.created[0].name, () => ({ error: "INTERNAL" }));
  await runCycle({ repo, client: gemini, paidAllowed: true, now: at(1 * H) }); // aplica erro e reenvia
  assert.equal(gemini.created.length, 2, "reenviado em novo lote");
  gemini.finish(gemini.created[1].name, () => ({ candidates: [{ content: { parts: [{ text: "{quebrado" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100 } }));
  const s = await runCycle({ repo, client: gemini, paidAllowed: true, now: at(2 * H) });
  assert.equal(s.failed, 1);
  assert.equal(repo.requests.get(r.id)!.status, "failed");
  assert.ok(repo.requests.get(r.id)!.cost_usd > 0, "tokens da resposta inválida contam no custo");
  assert.deepEqual(repo.notifications.map((n) => n.template), ["ai_analysis_failed"]);
});

test("pipeline: lote expirado → itens voltam para a fila", async () => {
  const { repo, gemini } = setup({ max_wait_hours: 0 });
  repo.add(r4());
  await runCycle({ repo, client: gemini, paidAllowed: true, now: at(0) });
  gemini.states.set(gemini.created[0].name, "expired");
  await runCycle({ repo, client: gemini, paidAllowed: true, now: at(49 * H) });
  assert.equal(gemini.created.length, 2);
  assert.equal([...repo.batches.values()][0].status, "expired");
});

test("pipeline: falha ao criar o lote libera os itens; orçamento esgotado não envia", async () => {
  const { repo, gemini } = setup({ max_wait_hours: 0 });
  repo.add(r4());
  gemini.failCreate = true;
  await runCycle({ repo, client: gemini, paidAllowed: true, now: at(0) });
  assert.equal([...repo.jobs.values()][0].status, "pending");
  assert.equal([...repo.batches.values()][0].status, "failed");

  const b = setup({ max_wait_hours: 0, daily_budget_usd: 0.01 });
  b.repo.add(r4());
  const s = await runCycle({ repo: b.repo, client: b.gemini, paidAllowed: true, now: at(0) });
  assert.equal(s.skipped, "budget_exhausted");
  assert.equal(b.gemini.created.length, 0);
});

test("pipeline: pedido cancelado durante o lote → resultado descartado", async () => {
  const { repo, gemini } = setup({ max_wait_hours: 0 });
  const r = repo.add(r4());
  await runCycle({ repo, client: gemini, paidAllowed: true, now: at(0) });
  repo.requests.get(r.id)!.status = "cancelled";
  gemini.finish(gemini.created[0].name, () => modelResponse(strikerOutput()));
  await runCycle({ repo, client: gemini, paidAllowed: true, now: at(1 * H) });
  assert.equal(repo.reports.length, 0);
  assert.equal(repo.notifications.length, 0);
});

test("pipeline: partida longa → trechos separados → consolidação → um relatório", async () => {
  const { repo, gemini } = setup({ max_wait_hours: 0 });
  const r = repo.add(request({ video_type: "full_match", video_minutes: 90 }));
  await runCycle({ repo, client: gemini, paidAllowed: true, now: at(0) });
  assert.equal(gemini.created[0].items.length, 6);
  // cada trecho responde com evidências dentro do próprio intervalo
  gemini.finish(gemini.created[0].name, (it) => {
    const job = repo.jobs.get(it.key)!;
    const t = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    const a = t(job.start_s! + 30), b = t(job.start_s! + 90);
    return modelResponse(strikerOutput({
      criteria: strikerOutput().criteria.map((c: { evidence: unknown[] }) => ({ ...c, evidence: c.evidence.length ? [{ t: a, note: "x" }, { t: b, note: "y" }] : [] })),
    }));
  });
  await runCycle({ repo, client: gemini, paidAllowed: true, now: at(1 * H) });
  assert.equal(gemini.created.length, 2, "consolidação enviada sem esperar a janela");
  assert.equal(gemini.created[1].items.length, 1);
  gemini.finish(gemini.created[1].name, () => modelResponse(strikerOutput({
    criteria: strikerOutput().criteria.map((c: { evidence: unknown[] }) => ({ ...c, evidence: c.evidence.length ? [{ t: "10:00", note: "x" }, { t: "50:00", note: "y" }] : [] })),
  })));
  await runCycle({ repo, client: gemini, paidAllowed: true, now: at(2 * H) });
  assert.equal(repo.requests.get(r.id)!.status, "completed");
  assert.equal(repo.reports.length, 1);
  assert.equal(repo.reports[0].report.video.segments, 6);
  assert.equal(repo.reports[0].video_type, "full_match");
});

test("pipeline: lote criado no provedor mas não registrado → reconciliado sem reenviar", async () => {
  const { repo, gemini } = setup({ max_wait_hours: 0 });
  repo.add(r4());
  await runCycle({ repo, client: gemini, paidAllowed: true, now: at(0) });
  const b = [...repo.batches.values()][0];
  Object.assign(b, { status: "creating", provider_name: null }); // simula queda após criar
  await runCycle({ repo, client: gemini, paidAllowed: true, now: at(1 * H) });
  assert.equal(b.status, "submitted");
  assert.equal(b.provider_name, gemini.created[0].name);
  assert.equal(gemini.created.length, 1, "não criou lote duplicado");
});
