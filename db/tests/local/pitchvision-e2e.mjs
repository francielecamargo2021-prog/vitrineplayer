// Teste PONTA A PONTA local: VitrinePlayer (Postgres local com TODAS as migrations, código real do integrador e
// do webhook) + PitchVision (servidor local real: API + worker, scripts/dev/e2e_server.py do outro repositório).
// Chamado por pitchvision-e2e.sh. Nada usa rede externa, Neon, Vercel ou GPU paga.
//
// O que é substituído: o Blob (a URL assinada aponta para um arquivo local lido pela PitchVision) e a escolha
// do responsável na tela (o teste escolhe o 1º candidato do atleta A e o 2º do atleta B — numa partida real,
// quem escolhe é a pessoa). O tipo de vídeo (SINTÉTICO ou REAL) é informado no resumo final.
import pg from "pg";
import http from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { applyEvent, runPvCycle } from "../../../src/lib/pitchvision/integrator.ts";
import { HttpPvClient } from "../../../src/lib/pitchvision/client.ts";
import { makePvRepo } from "../../../src/lib/pitchvision/repo-sql.ts";
import { athleteRef, signBody, verifySignature } from "../../../src/lib/pitchvision/signature.ts";

const env = process.env;
const VIDEO = env.E2E_VIDEO;
const KIND = env.E2E_VIDEO_KIND ?? "synthetic";
const DETECTOR = env.E2E_DETECTOR ?? "colorblob";
const TIMEOUT_S = Number(env.E2E_TIMEOUT_S ?? 300);
const PV_PORT = 8099, HOOK_PORT = 8098;
const SECRET = randomBytes(24).toString("hex");
const REF_KEY = randomBytes(24).toString("hex");
const KEY_FILE = `${env.E2E_WORK}/pv.key`;
const assert = (ok, msg) => { if (!ok) { console.error(`✗ ${msg}`); failures++; } else console.log(`✓ ${msg}`); };
let failures = 0;

const owner = new pg.Client({ connectionString: env.VP_DB_URL });
const service = new pg.Client({ connectionString: env.VP_DB_URL });
await owner.connect();
await service.connect();
await service.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
const run = async (text, params) => (await service.query(text, params)).rows;
const repo = makePvRepo(run);

async function asUser(uid, sql, params = []) {
  await owner.query("begin");
  try {
    await owner.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await owner.query("set local role authenticated");
    const r = (await owner.query(sql, params)).rows;
    await owner.query("commit");
    return r;
  } catch (e) {
    await owner.query("rollback");
    throw e;
  }
}

// ---------------------------------------------------------------- dados (dois responsáveis, atletas menores, um arquivo)
const A = "a4000000-0000-0000-0000-00000000000a", B = "b4000000-0000-0000-0000-00000000000b";
await owner.query(`insert into neon_auth."user" (id, name, email, "emailVerified") values ($1, 'Resp A', 'e2e-a@test.dev', true), ($2, 'Resp B', 'e2e-b@test.dev', true)`, [A, B]);
await owner.query(`update ai_settings set pitchvision_enabled = true`);
const ath = {};
for (const [uid, name, years] of [[A, "Atleta A", 15], [B, "Atleta B", 14]]) {
  const [r] = await asUser(uid, `select create_athlete($1, $1, (current_date - ($2 || ' years')::interval)::date, 'BR') as id`, [name, String(years)]);
  ath[uid] = r.id;
}
const size = readFileSync(VIDEO).length;
const reqs = {};
for (const uid of [A, B]) {
  const path = `analises/${ath[uid]}/${randomBytes(16).toString("hex")}.mp4`;
  const [v] = await asUser(uid, `select register_analysis_video($1, $2, 'video/mp4', $3, 300, 'full_match') as id`, [ath[uid], path, size]);
  await owner.query(`insert into ai_analysis_grants (athlete_id, quantity, reason) values ($1, 1, 'e2e')`, [ath[uid]]);
  const [q] = await asUser(uid, `select request_pitchvision_analysis($1, $2, 'azul', 'CM', 'pv-e2e', 'pitchvision-v2', 'pitchvision-v2') as id`, [v.id, uid === A ? 7 : 10]);
  reqs[uid] = q.id;
}
assert(Object.keys(reqs).length === 2, "dois pedidos PitchVision criados pelos responsáveis (crédito de beta, menores de idade)");

// ---------------------------------------------------------------- webhook da VitrinePlayer (mesma lógica da rota)
const client = new HttpPvClient({ baseUrl: `http://127.0.0.1:${PV_PORT}`, apiKey: "" });
let hookCalls = 0, hookDup = 0, hookBad = 0, lastBody = null, lastSig = null;
const hook = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const sig = req.headers["x-pitchvision-signature"] ?? null;
      if (!verifySignature(SECRET, sig, body, Math.floor(Date.now() / 1000))) { hookBad++; res.writeHead(401).end(); return; }
      const ev = JSON.parse(body);
      hookCalls++; lastBody = body; lastSig = sig;
      if (!(await repo.registerEvent(ev.id, ev.type))) { hookDup++; res.writeHead(200).end("dup"); return; }
      await applyEvent({ type: ev.type, data: ev.data }, { repo, client });
      res.writeHead(200).end("ok");
    } catch (e) {
      console.error("[hook]", e?.message ?? e);
      res.writeHead(500).end();
    }
  });
}).listen(HOOK_PORT, "127.0.0.1");

// ---------------------------------------------------------------- PitchVision local (API + worker reais)
const pv = spawn(env.PV_PYTHON, [`${env.PV_REPO}/scripts/dev/e2e_server.py`, "--port", String(PV_PORT), "--video", VIDEO,
  "--detector", DETECTOR, "--webhook-url", `http://127.0.0.1:${HOOK_PORT}/hook`, "--webhook-secret", SECRET,
  "--key-file", KEY_FILE, "--workdir", `${env.E2E_WORK}/pv`], { stdio: ["ignore", "inherit", "inherit"], cwd: env.PV_REPO });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 120; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PV_PORT}/healthz`)).ok) break; } catch { /* subindo */ }
  await sleep(500);
}
client.key = readFileSync(KEY_FILE, "utf8").trim();
const signer = { async presignGet(p) { return `https://blob.local/${p}?vercel-blob-signature=e2e&vercel-blob-valid-until=${Date.now() + 864e5}`; } };
const deps = { repo, client, signer, athleteRef: (id) => athleteRef(REF_KEY, id), onError: (w, id, e) => console.error(`[ciclo] ${w} ${id}: ${e?.message ?? e}`) };

const stagesSeen = { [A]: [], [B]: [] };
async function snapshot() {
  const rows = (await owner.query(`select id, status::text, pv_stage, pv_match_id, pv_request_id from ai_analysis_requests where provider = 'pitchvision'`)).rows;
  for (const r of rows) {
    const uid = r.id === reqs[A] ? A : B;
    const s = r.status === "completed" ? "completed" : r.pv_stage ?? r.status;
    if (stagesSeen[uid].at(-1) !== s) stagesSeen[uid].push(s);
  }
  return rows;
}
async function until(pred, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < TIMEOUT_S * 1000) {
    await runPvCycle(deps);
    const rows = await snapshot();
    if (pred(rows)) return (Date.now() - t0) / 1000;
    await sleep(1000);
  }
  throw new Error(`tempo esgotado: ${label}`);
}

const t0 = Date.now();
let rows;
try {
  const tPick = await until((rs) => rs.every((r) => r.pv_stage === "athlete_pick"), "escolha do atleta");
  rows = await snapshot();
  assert(true, `partida processada e pedidos aguardando a escolha visual (${tPick.toFixed(1)} s)`);
  const [m1, m2] = await Promise.all(rows.map((r) => client.getMatch(r.pv_match_id)));
  const ids = rows.map((r) => r.pv_match_id);
  assert(m1.analysis_id && m1.analysis_id === m2.analysis_id, `mesmo arquivo de duas famílias → uma única análise na PitchVision (partidas ${ids.join(", ")}, análise ${m1.analysis_id})`);

  // escolha visual (o teste escolhe; na tela, é o responsável)
  for (const [uid, idx] of [[A, 0], [B, 1]]) {
    const r = rows.find((x) => x.id === reqs[uid]);
    const { candidates } = await client.getCandidates(r.pv_request_id);
    assert(candidates.length >= 2, `${uid === A ? "A" : "B"}: ${candidates.length} candidatos com miniatura`);
    const thumb = await client.getBinary(r.pv_request_id, "thumbnail", String(candidates[idx].track_id));
    assert(thumb.headers.get("content-type") === "image/jpeg", "miniatura disponível para a escolha");
    await client.confirmIdentity(r.pv_request_id, [candidates[idx].track_id]);
    await repo.setStage(r.pv_request_id, "athlete_metrics");
  }
  const tDone = await until((rs) => rs.every((r) => r.status === "completed"), "relatórios");
  assert(true, `relatórios concluídos (${tDone.toFixed(1)} s depois da escolha)`);

  const reports = (await owner.query(`select provider, overall_score, coverage, confidence::text, summary, report from ai_video_reports`)).rows;
  assert(reports.length === 2 && reports.every((r) => r.provider === "pitchvision" && r.overall_score === null), "dois relatórios PitchVision no perfil, sem nota geral");
  assert(reports.every((r) => r.report.accuracy_validated === false && r.report.external_ai_used === false), "relatório declara precisão NÃO validada e nenhuma IA externa");
  assert(reports.every((r) => r.report.validated.observed_seconds > 0), `tempo observado medido: ${reports.map((r) => r.report.validated.observed_seconds).join(" s, ")} s`);
  assert(reports.every((r) => Object.keys(r.report.unavailable).includes("dribbles")), "métricas não validadas listadas como indisponíveis");
  const scores = (await owner.query(`select count(*)::int as n from ai_report_scores`)).rows[0].n;
  assert(scores === 0, "nenhuma nota por fundamento");
  const notes = (await owner.query(`select template, count(*)::int as n from notification_outbox group by template order by 1`)).rows;
  assert(notes.some((n) => n.template === "pv_athlete_pick" && n.n === 2) && notes.some((n) => n.template === "ai_report_ready" && n.n === 2),
    `avisos às famílias: ${notes.map((n) => `${n.template}×${n.n}`).join(", ")}`);
  const events = (await owner.query(`select count(*)::int as n from pitchvision_events`)).rows[0].n;
  assert(hookCalls > 0 && events > 0, `avisos assinados recebidos: ${hookCalls} (eventos únicos gravados: ${events})`);

  // repetição do mesmo aviso e aviso com assinatura errada
  const replay = await fetch(`http://127.0.0.1:${HOOK_PORT}/hook`, { method: "POST", body: lastBody, headers: { "x-pitchvision-signature": lastSig } });
  assert(replay.ok && (await replay.text()) === "dup", "aviso repetido é ignorado");
  const forged = await fetch(`http://127.0.0.1:${HOOK_PORT}/hook`, { method: "POST", body: lastBody,
    headers: { "x-pitchvision-signature": `t=${Math.floor(Date.now() / 1000)},v1=${signBody("x".repeat(40), Math.floor(Date.now() / 1000), lastBody)}` } });
  assert(forged.status === 401, "aviso com assinatura falsa é recusado");
  for (const uid of [A, B]) {
    const seen = stagesSeen[uid];
    assert(seen.includes("athlete_pick") && seen.at(-1) === "completed", `${uid === A ? "A" : "B"}: etapas reais observadas: ${seen.join(" → ")}`);
  }
} catch (e) {
  console.error(`✗ ${e.message}`);
  failures++;
} finally {
  pv.kill("SIGTERM");
  hook.close();
  await owner.end();
  await service.end();
}
console.log(JSON.stringify({ video: KIND, detector: DETECTOR, total_s: Math.round((Date.now() - t0) / 100) / 10, failures,
  note: KIND === "synthetic" ? "vídeo sintético: prova o fluxo técnico, não a precisão" : "partida real: prova o fluxo; precisão NÃO avaliada aqui" }));
process.exit(failures ? 1 : 0);
