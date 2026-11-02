/**
 * Integração com a PitchVision, sem rede e sem banco: assinatura dos avisos, relatório a partir de uma
 * saída REAL da PitchVision (vídeo SINTÉTICO de testes, ver fixtures/pv-v2-synthetic.json) e o ciclo completo
 * com repositório e cliente simulados. Estes testes provam o FLUXO, não a precisão da análise.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { signBody, verifySignature, athleteRef } from "../signature.ts";
import { mapResult, type PvResult } from "../report.ts";
import { applyEvent, runPvCycle, stageFor, type InProgress, type PvRepo, type Stage, type ToSend } from "../integrator.ts";
import type { PvClient, PvMatch, PvRequest } from "../client.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/pv-v2-synthetic.json", import.meta.url), "utf8"));
const SECRET = "s".repeat(40);

test("assinatura: válida, adulterada, antiga e sem segredo", () => {
  const body = JSON.stringify({ id: "e1", type: "athlete_request.updated", data: {} });
  const now = 1_800_000_000;
  const h = `t=${now},v1=${signBody(SECRET, now, body)}`;
  assert.equal(verifySignature(SECRET, h, body, now), true);
  assert.equal(verifySignature(SECRET, h, body + " ", now), false, "corpo alterado");
  assert.equal(verifySignature(SECRET, h, body, now + 301), false, "fora da janela de 5 min");
  assert.equal(verifySignature("curto", h, body, now), false, "segredo curto nunca valida");
  assert.equal(verifySignature(SECRET, null, body, now), false);
  assert.equal(verifySignature("x".repeat(40), h, body, now), false, "outro segredo");
});

test("referência do atleta: opaca, estável e sem o id", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  const a = athleteRef("k".repeat(32), id);
  assert.equal(a, athleteRef("k".repeat(32), id));
  assert.ok(!a.includes("1111") && a.startsWith("a_") && a.length <= 42);
  assert.notEqual(a, athleteRef("j".repeat(32), id));
  assert.throws(() => athleteRef("curta", id));
});

test("relatório a partir da saída real da PitchVision (vídeo sintético): níveis separados, sem notas", () => {
  const p = mapResult(fixture.result as PvResult, { position: "CM", lang: "pt" });
  assert.equal(p.position_group, "mid");
  assert.equal(p.coverage, 1);                        // 5 s observados de 5 s analisados no vídeo sintético
  assert.equal(p.confidence, "medium");               // escolha do responsável + cobertura ≥ 50%; nunca "high"
  assert.match(p.summary, /0 min 05 s/);
  assert.match(p.summary, /confirmada pelo responsável/);
  assert.deepEqual(p.strengths, []);                  // sem elogio genérico sem métrica validada
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- leitura livre do JSON do relatório no teste
  const r = p.report as Record<string, any>;
  assert.equal(r.accuracy_validated, false);
  assert.equal(r.external_ai_used, false);
  assert.equal(r.unavailable.dribbles, "not_validated");
  assert.equal(r.unavailable.positions, "no_calibration");
  assert.equal(r.identity.jersey_verified, false);
  assert.ok(!("scores" in r) && !("overall_score" in r));
  assert.ok(r.evidence.length >= 1 && r.evidence.every((e: Record<string, unknown>) => !("url" in e)), "evidência sem endereço da PitchVision");
  const es = mapResult(fixture.result as PvResult, { position: "ST", lang: "es" });
  assert.match(es.summary, /seguido durante/);
});

test("relatório fora do contrato é recusado (nota ou IA externa)", () => {
  const bad = structuredClone(fixture.result);
  bad.report.scores = { overall: 4 };
  assert.throws(() => mapResult(bad, { position: "CM", lang: "pt" }));
  const ai = structuredClone(fixture.result);
  ai.report.external_ai_used = true;
  assert.throws(() => mapResult(ai, { position: "CM", lang: "pt" }));
});

test("etapas reais a partir dos estados da PitchVision", () => {
  assert.equal(stageFor({ status: "waiting_match" }, { status: "ingesting" }), "receiving_video");
  assert.equal(stageFor({ status: "waiting_match" }, { status: "processing" }), "processing_match");
  assert.equal(stageFor({ status: "awaiting_input" }, null), "athlete_pick");
  assert.equal(stageFor({ status: "running" }, null), "athlete_metrics");
  assert.equal(stageFor({ status: "completed" }, null), "completed");
  assert.equal(stageFor({ status: "waiting_match" }, { status: "failed" }), "failed");
  assert.equal(stageFor({ status: "deleted" }, null), null);
});

// ---------------------------------------------------------------- ciclo com repositório e cliente simulados
function world() {
  const toSend: ToSend[] = [1, 2].map((i) => ({
    request_id: `00000000-0000-0000-0000-00000000000${i}`, athlete_id: `a${i}`, video_id: "11111111-1111-1111-1111-111111111111",
    blob_pathname: `analises/a${i}/jogo.mp4`, video_type: "full_match", shirt_number: 6 + i, shirt_color: "azul",
    athlete_position: "CM", birth_year: 2012, category: "Sub-15",
  }));
  const rows = new Map<string, InProgress & { status: string }>();
  const reports = new Map<string, unknown>();
  const notes: string[] = [];
  const signed: string[] = [];
  const pvMatches = new Map<string, PvMatch>();
  const pvRequests = new Map<string, PvRequest>();
  let seq = 0;
  const repo: PvRepo = {
    async requestsToSend() { return toSend.filter((r) => ![...rows.values()].some((x) => x.request_id === r.request_id)); },
    async linkRequest(requestId, matchId, pvRequestId, stage) {
      if ([...rows.values()].some((x) => x.request_id === requestId)) return false;
      rows.set(pvRequestId, { request_id: requestId, athlete_id: toSend.find((t) => t.request_id === requestId)!.athlete_id, pv_match_id: matchId,
        pv_request_id: pvRequestId, pv_stage: stage, position: "CM", report_locale: "pt-BR", status: "processing" });
      return true;
    },
    async inProgress() { return [...rows.values()].filter((r) => r.status === "processing"); },
    async byPvRequest(id) { return rows.get(id) ?? null; },
    async byPvMatch(id) { return [...rows.values()].filter((r) => r.pv_match_id === id && r.status === "processing"); },
    async setStage(id, stage: Stage, status) { const r = rows.get(id)!; r.pv_stage = stage; if (status) r.status = status; },
    async saveReport(id, payload) {
      const r = rows.get(id)!;
      if (!reports.has(id)) reports.set(id, payload);
      r.status = "completed"; r.pv_stage = "completed";
      return `rep-${id}`;
    },
    async notifyGuardians(athleteId, template) { notes.push(`${athleteId}:${template}`); },
  };
  const client: PvClient = {
    async createMatch(input) {
      signed.push(input.video_url);
      assert.match(input.external_ref, /^vid_[0-9a-f]{32}$/);
      assert.equal(input.minors, true);
      const m = pvMatches.get(input.external_ref) ?? { id: `m${++seq}`, status: "ingesting", stage: "queued", error: null };
      pvMatches.set(input.external_ref, m);
      return m;
    },
    async getMatch(id) { return [...pvMatches.values()].find((m) => m.id === id)!; },
    async createAthleteRequest(mid, input) {
      assert.ok(input.external_athlete_ref.startsWith("a_"), "nunca o id do atleta");
      const r = pvRequests.get(input.external_ref) ?? { id: `r${++seq}`, match_id: mid, status: "waiting_match", stage: null, error: null, identity: null };
      pvRequests.set(input.external_ref, r);
      return r;
    },
    async getRequest(id) { return [...pvRequests.values()].find((r) => r.id === id)!; },
    async getCandidates() { return { candidates: [], automatic_identity: false }; },
    async confirmIdentity(id) { const r = await this.getRequest(id); r.status = "queued"; return r; },
    async getResult() { return fixture.result; },
    async getBinary() { return new Response(""); },
    async deleteRequest() {},
  };
  const signer = { async presignGet(p: string) { return `https://store.private.blob.vercel-storage.com/${p}?vercel-blob-signature=x`; } };
  const onError = (_w: string, _id: string, e: unknown) => { if (!String(e).includes("ECONNRESET")) console.error(e); };
  return { onError, repo, client, signer, rows, reports, notes, signed, pvMatches, pvRequests, athleteRef: (id: string) => athleteRef("k".repeat(32), id) };
}

test("ciclo: dois atletas do MESMO vídeo → uma partida, dois pedidos, etapas reais e relatório gravado uma vez", async () => {
  const w = world();
  let s = await runPvCycle(w);
  assert.equal(s.sent, 2);
  assert.equal(w.pvMatches.size, 1, "mesmo arquivo: uma única partida na PitchVision");
  assert.equal(w.pvRequests.size, 2);
  assert.ok(w.signed.every((u) => u.includes("vercel-blob-signature")), "vídeo entregue por URL assinada");
  assert.ok([...w.rows.values()].every((r) => r.pv_stage === "receiving_video"));

  s = await runPvCycle(w);
  assert.equal(s.sent, 0, "nada é reenviado");

  const m = [...w.pvMatches.values()][0];
  m.status = "processing";
  await runPvCycle(w);
  assert.ok([...w.rows.values()].every((r) => r.pv_stage === "processing_match"));

  m.status = "ready";
  for (const r of w.pvRequests.values()) r.status = "awaiting_input";
  await runPvCycle(w);
  assert.ok([...w.rows.values()].every((r) => r.pv_stage === "athlete_pick"));
  assert.equal(w.notes.filter((n) => n.endsWith("pv_athlete_pick")).length, 2, "um aviso por responsável");
  await runPvCycle(w);
  assert.equal(w.notes.filter((n) => n.endsWith("pv_athlete_pick")).length, 2, "aviso não se repete");

  for (const r of w.pvRequests.values()) r.status = "completed";
  s = await runPvCycle(w);
  assert.equal(s.completed, 2);
  assert.equal(w.reports.size, 2);
  assert.ok([...w.rows.values()].every((r) => r.status === "completed"));
  assert.equal(w.notes.filter((n) => n.endsWith("ai_report_ready")).length, 2);
  s = await runPvCycle(w);
  assert.equal(s.completed, 0, "concluído não é processado de novo");
});

test("falha da partida vira falha do pedido, com aviso; eventos fora de ordem não reabrem", async () => {
  const w = world();
  await runPvCycle(w);
  const m = [...w.pvMatches.values()][0];
  m.status = "failed"; m.error = "download failed";
  await runPvCycle(w);
  assert.ok([...w.rows.values()].every((r) => r.status === "failed" && r.pv_stage === "failed"));
  assert.equal(w.notes.filter((n) => n.endsWith("ai_analysis_failed")).length, 2);
  const r0 = [...w.pvRequests.values()][0];
  assert.equal(await applyEvent({ type: "athlete_request.updated", data: { ...r0, status: "awaiting_input" } as unknown as Record<string, unknown> }, w), "athlete_pick",
    "o webhook só muda a etapa; o banco (pv_set_stage) é quem recusa reabrir pedido encerrado");
});

test("erro de rede no envio: pedido fica na fila e nada é marcado", async () => {
  const w = world();
  w.client.createMatch = async () => { throw new Error("ECONNRESET"); };
  const s = await runPvCycle(w);
  assert.equal(s.sent, 0);
  assert.equal(s.errors, 2);
  assert.equal(w.rows.size, 0);
});
