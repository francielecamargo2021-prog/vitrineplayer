/**
 * Calibração do campo (passo do responsável) e modo link (só adultos), sem rede e sem banco: validação dos pontos,
 * núcleo da ação do servidor com cliente simulado, mapeamento das recusas, formulário do link, relatório a partir de
 * uma saída da PitchVision no modo link (IA FALSA nos testes da PitchVision: prova o contrato, não a precisão) e
 * envio pelo ciclo do integrador.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCalibration, calibrationError, diagramPositions, frameTimes, submitCalibrationFor, type MarkedPoint } from "../calibration.ts";
import { embedUrl, isAdult, mapLinkResult, parseClock, parseLinkForm, youtubeId, type PvLinkResult } from "../link.ts";
import { mapResult, type PvResult } from "../report.ts";
import { PvError, type CalibrationInput, type PvClient } from "../client.ts";
import { runPvCycle, sendLinkOne, type LinkToSend, type PvRepo } from "../integrator.ts";

const linkFixture = JSON.parse(readFileSync(new URL("./fixtures/pv-v2-link-fake-ai.json", import.meta.url), "utf8"));
const fileFixture = JSON.parse(readFileSync(new URL("./fixtures/pv-v2-synthetic.json", import.meta.url), "utf8"));

const LANDMARKS = { corner_far_left: [0, 0], corner_far_right: [100, 0], corner_near_left: [0, 64], corner_near_right: [100, 64], centre_spot: [50, 32] } as Record<string, [number, number]>;
const FOUR: MarkedPoint[] = [
  { landmark: "corner_far_left", x: 200, y: 80 }, { landmark: "corner_far_right", x: 1080, y: 80 },
  { landmark: "corner_near_left", x: 10, y: 700 }, { landmark: "corner_near_right", x: 1270, y: 700 },
];
const FRAME = { t: 30, width: 1280, height: 720 };

test("calibração: pontos validados antes de ir à PitchVision", () => {
  const ok = buildCalibration(FOUR, FRAME, Object.keys(LANDMARKS));
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.input.points.length, 4);
    assert.equal(ok.input.recompute, false, "o relatório deste pedido ainda não existe: nada a recalcular");
    assert.deepEqual(ok.input.points[0], { image: [200, 80], landmark: "corner_far_left" });
    assert.equal(ok.input.frame_width, 1280);
  }
  assert.deepEqual(buildCalibration(FOUR.slice(0, 3), FRAME, Object.keys(LANDMARKS)), { ok: false, error: "few" });
  assert.deepEqual(buildCalibration([...FOUR.slice(0, 3), { ...FOUR[0], x: 5 }], FRAME, Object.keys(LANDMARKS)), { ok: false, error: "duplicate" });
  assert.deepEqual(buildCalibration([...FOUR.slice(0, 3), { ...FOUR[3], x: 1300 }], FRAME, Object.keys(LANDMARKS)), { ok: false, error: "outside" });
  assert.deepEqual(buildCalibration([...FOUR.slice(0, 3), { landmark: "box_left_far", x: 5, y: 5 }], FRAME, Object.keys(LANDMARKS)), { ok: false, error: "unknown" },
    "ponto que não existe neste campo (categoria pequena) é recusado");
  assert.deepEqual(buildCalibration(FOUR, { ...FRAME, width: 0 }, Object.keys(LANDMARKS)), { ok: false, error: "frame" });
});

test("calibração: recusas da PitchVision viram mensagens do dicionário", () => {
  assert.equal(calibrationError(422, "a ordem dos pontos não confere com o campo: confira se algum ponto foi trocado"), "swapped");
  assert.equal(calibrationError(422, "os pontos estão quase em linha: marque pontos mais espalhados pelo campo"), "collinear");
  assert.equal(calibrationError(422, "com 4 pontos, não use 3 na mesma linha do campo"), "collinear");
  assert.equal(calibrationError(422, "calibração instável (erro de validação 9.0 m)"), "unstable");
  assert.equal(calibrationError(409, "a câmera se move neste vídeo"), "moving");
  assert.equal(calibrationError(409, "a partida ainda não está pronta"), "notReady");
  assert.equal(calibrationError(500, "x"), "generic");
  assert.deepEqual(frameTimes(600), [60, 210, 360]);
  const pos = diagramPositions(LANDMARKS, { length_m: 100, width_m: 64 });
  assert.deepEqual(pos.centre_spot, { x: 0.5, y: 0.5 });
});

function calClient(over: Partial<PvClient> = {}) {
  const sent: CalibrationInput[] = [];
  const client: Pick<PvClient, "getCalibrationInfo" | "submitCalibration"> = {
    async getCalibrationInfo(mid) {
      assert.equal(mid, "m1");
      return { match_id: "m1", min_points: 4, pitch: { length_m: 100, width_m: 64, source: "category_default" }, landmarks: LANDMARKS, calibration: null };
    },
    async submitCalibration(mid, input) {
      sent.push(input);
      return { calibration: { id: "c1", quality: { method: "homography", points: input.points.length, fit_rmse_m: 0, loo_mean_m: null, validated_by_loo: false } } };
    },
    ...over,
  };
  return { client, sent };
}

test("ação de calibração: só o pedido do atleta, só na etapa de escolha", async () => {
  const row = { athlete_id: "a1", status: "processing", pv_stage: "athlete_pick", pv_match_id: "m1" };
  const { client, sent } = calClient();
  assert.deepEqual(await submitCalibrationFor(row, "a1", FOUR, FRAME, client), { ok: true, method: "homography", points: 4, error_m: null });
  assert.equal(sent.length, 1);
  for (const bad of [null, { ...row, athlete_id: "a2" }, { ...row, pv_stage: "athlete_metrics" }, { ...row, status: "completed" }, { ...row, pv_match_id: null }]) {
    assert.deepEqual(await submitCalibrationFor(bad, "a1", FOUR, FRAME, client), { ok: false, error: "notAllowed" });
  }
  assert.equal(sent.length, 1, "nada é enviado sem permissão");
  assert.deepEqual(await submitCalibrationFor(row, "a1", FOUR.slice(0, 2), FRAME, client), { ok: false, error: "few" });
  const refused = calClient({ async submitCalibration() { throw new PvError(422, "confira se algum ponto foi trocado"); } });
  assert.deepEqual(await submitCalibrationFor(row, "a1", FOUR, FRAME, refused.client), { ok: false, error: "swapped" });
  const down = calClient({ async getCalibrationInfo() { throw new Error("ECONNRESET"); } });
  assert.deepEqual(await submitCalibrationFor(row, "a1", FOUR, FRAME, down.client), { ok: false, error: "generic" });
});

test("relatório de arquivo calibrado: posições e distância só como experimental", () => {
  const r = structuredClone(fileFixture.result) as PvResult;
  r.report.validated = { ...r.report.validated, positions_available: true };      // contrato antigo: nunca vira "medido"
  r.report.experimental = { positions_available: true, heatmap_available: true, distance_m: 412.3 };
  r.report.calibration = { method: "homography", points: 4, error_m: 0.0, error_kind: "fit_only", level: "experimental" };
  const p = mapResult(r, { position: "CM", lang: "pt" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- leitura livre do JSON do relatório no teste
  const rep = p.report as Record<string, any>;
  assert.ok(!("positions_available" in rep.validated));
  assert.equal(rep.experimental.distance_m, 412.3);
  assert.equal(rep.calibration.level, "experimental");
  assert.match(p.summary, /estimativa/);
});

test("modo link: link, tempo e idade", () => {
  assert.equal(youtubeId("https://youtu.be/AbCdEfGhIj0?t=3"), "AbCdEfGhIj0");
  assert.equal(youtubeId("https://www.youtube.com/watch?v=AbCdEfGhIj0&list=x"), "AbCdEfGhIj0");
  assert.equal(youtubeId("https://www.youtube.com/shorts/AbCdEfGhIj0"), "AbCdEfGhIj0");
  assert.equal(youtubeId("https://vimeo.com/123"), null);
  assert.equal(youtubeId("https://www.youtube.com.evil.com/watch?v=AbCdEfGhIj0"), null);
  assert.equal(youtubeId("javascript:alert(1)"), null);
  assert.equal(parseClock("03:12"), 192);
  assert.equal(parseClock("1:02:03"), 3723);
  assert.equal(parseClock("3:75"), null);
  const now = new Date("2026-11-16T12:00:00Z");
  assert.equal(isAdult("2008-11-16", now), true);
  assert.equal(isAdult("2008-11-17", now), false, "faz 18 amanhã: ainda menor");
  assert.equal(isAdult(null, now), false, "sem data = menor");
  assert.equal(embedUrl("AbCdEfGhIj0", 65.7), "https://www.youtube-nocookie.com/embed/AbCdEfGhIj0?start=65&rel=0&modestbranding=1");
  assert.throws(() => embedUrl("x\"><script>", 1));
});

test("modo link: formulário", () => {
  const form = (o: Record<string, string>) => (k: string) => o[k] ?? "";
  const base = { url: "https://youtu.be/AbCdEfGhIj0", minutes: "90", appears_at: "03:12", shirt_number: "10", shirt_color: "azul", position: "CM", video_type: "full_match" };
  const ok = parseLinkForm(form(base), ["CM", "ST"]);
  assert.deepEqual(ok, { ok: true, args: { youtube_id: "AbCdEfGhIj0", minutes: 90, video_type: "full_match", shirt_number: 10, shirt_color: "azul", position: "CM", appears_at: "03:12" } });
  assert.deepEqual(parseLinkForm(form({ ...base, url: "https://vimeo.com/1" }), ["CM"]), { ok: false, error: "link" });
  assert.deepEqual(parseLinkForm(form({ ...base, appears_at: "3h" }), ["CM"]), { ok: false, error: "clock" });
  assert.deepEqual(parseLinkForm(form({ ...base, appears_at: "95:00" }), ["CM"]), { ok: false, error: "clock" }, "depois do fim do vídeo");
  assert.deepEqual(parseLinkForm(form({ ...base, minutes: "0" }), ["CM"]), { ok: false, error: "duration" });
  assert.deepEqual(parseLinkForm(form({ ...base, position: "XX" }), ["CM"]), { ok: false, error: "generic" });
});

test("modo link: relatório com momentos não verificados, sem contagem nem nota", () => {
  const p = mapLinkResult(linkFixture.result as PvLinkResult, { position: "CM", lang: "pt" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- leitura livre do JSON do relatório no teste
  const r = p.report as Record<string, any>;
  assert.equal(r.mode, "link");
  assert.equal(r.external_ai_used, true);
  assert.equal(r.youtube_id, "AbCdEfGhIj0");
  assert.equal(p.confidence, "low");
  assert.equal(p.coverage, 0);
  assert.deepEqual(r.moments.map((m: { time: string }) => m.time), ["01:05", "04:10", "04:20", "07:30"]);
  assert.ok(r.moments.every((m: Record<string, unknown>) => m.evidence_level === "ai_unverified" && !("model_confidence" in m)));
  assert.ok(!("validated" in r) && r.scores === null);
  assert.match(p.summary, /não foi verificado|Nada aqui foi verificado/);
  assert.match(mapLinkResult(linkFixture.result as PvLinkResult, { position: "CM", lang: "es" }).summary, /revisar/);
  const bad = structuredClone(linkFixture.result);
  bad.report.validated = { goals: 2 };
  assert.throws(() => mapLinkResult(bad, { position: "CM", lang: "pt" }), /fora do contrato/);
  const minors = structuredClone(linkFixture.result);
  minors.report.minors = true;
  assert.throws(() => mapLinkResult(minors, { position: "CM", lang: "pt" }));
  assert.throws(() => mapResult(linkFixture.result, { position: "CM", lang: "pt" }), "o mapeamento de arquivo recusa IA externa");
});

function linkWorld(rows: LinkToSend[]) {
  const failed: [string, string][] = [];
  const linked: string[] = [];
  const created: unknown[] = [];
  const repo = {
    async linkRequestsToSend() { return rows.filter((r) => !linked.includes(r.request_id) && !failed.some(([id]) => id === r.request_id)); },
    async failUnsent(id: string, e: string) { failed.push([id, e]); },
    async linkRequest(id: string) { linked.push(id); return true; },
    async requestsToSend() { return []; },
    async inProgress() { return []; },
  } as unknown as PvRepo;
  const client = {
    async createLinkMatch(input: { url: string; minors: boolean; authorization: { age_band: string } }) {
      created.push(input);
      if (input.url.includes("PrivateVid1")) throw new PvError(422, "o vídeo é privado ou não permite incorporação");
      if (input.url.includes("NetDown0000")) throw new Error("ECONNRESET");
      return { id: "lm1", status: "ready", stage: "link_ready", error: null };
    },
    async createLinkRequest() { return { id: "lr1", match_id: "lm1", status: "queued", stage: "queued", error: null, identity: null }; },
  } as unknown as PvClient;
  return { repo, client, failed, linked, created, signer: { async presignGet() { return ""; } }, athleteRef: () => "a_x" };
}

const LINK_ROW: LinkToSend = { request_id: "00000000-0000-0000-0000-000000000009", athlete_id: "a9", youtube_id: "AbCdEfGhIj0", video_minutes: 90,
  shirt_number: 10, shirt_color: "azul", athlete_position: "CM", appears_at: "03:12", category: null, adult: true };

test("modo link no ciclo: só com a chave ligada, só adultos, recusa definitiva encerra o pedido", async () => {
  const off = linkWorld([LINK_ROW]);
  await runPvCycle(off);
  assert.equal(off.created.length, 0, "PITCHVISION_LINK_ENABLED desligado: nada é enviado");

  const w = linkWorld([LINK_ROW, { ...LINK_ROW, request_id: "r-minor", adult: false }, { ...LINK_ROW, request_id: "r-private", youtube_id: "PrivateVid1" },
    { ...LINK_ROW, request_id: "r-net", youtube_id: "NetDown0000" }]);
  const s = await runPvCycle({ ...w, linkEnabled: true, onError: () => undefined });
  assert.equal(s.sent, 1);
  assert.equal(s.failed, 2);
  assert.equal(s.errors, 1, "erro de rede: fica na fila para o próximo ciclo");
  assert.deepEqual(w.failed.map(([id]) => id).sort(), ["r-minor", "r-private"]);
  assert.ok(!w.created.some((c) => JSON.stringify(c).includes("r-minor")), "pedido de menor nunca chega à PitchVision");
  const sentInput = w.created[0] as { minors: boolean; duration_s: number; authorization: { age_band: string } };
  assert.equal(sentInput.minors, false);
  assert.equal(sentInput.authorization.age_band, "adults");
  assert.equal(sentInput.duration_s, 5400);
  const again = await sendLinkOne(LINK_ROW, w);
  assert.equal(again.failed, false);
});
