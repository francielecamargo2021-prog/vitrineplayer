// Conferência SEM CUSTO antes da primeira análise real (nenhuma geração é feita):
//   1. a chave existe no servidor (o valor nunca é exibido);
//   2. lista os modelos que essa chave enxerga e confirma o modelo configurado;
//   3. conta os tokens da requisição REAL do vídeo (countTokens, não cobrado) e calcula o custo.
// Uso: node scripts/gemini-preflight.mjs <youtubeId> <minutos> <camisa> <cor> <posição> [modelo]
//   ex.: node scripts/gemini-preflight.mjs dQw4w9WgXcQ 4 10 azul ST
import { buildVideoRequest } from "../src/lib/ai/prompt.ts";
import { planJobs } from "../src/lib/ai/planner.ts";
import { costUsd, directMaxCost, DIRECT_MAX_OUTPUT_TOKENS, priceFor } from "../src/lib/ai/pricing.ts";
import { RUBRIC_VERSION } from "../src/lib/ai/rubric.ts";
import { PROMPT_VERSION } from "../src/lib/ai/prompt.ts";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const key = process.env.GEMINI_API_KEY ?? "";
if (!key) { console.log("GEMINI_API_KEY: ausente — falta configurar no ambiente"); process.exit(2); }
console.log("GEMINI_API_KEY: disponível (valor não exibido)");
const headers = { "x-goog-api-key": key, "Content-Type": "application/json" };
const safe = (t) => t.replaceAll(key, "[chave]").slice(0, 400);

const [yt, minutes, shirt, color, position, modelArg] = process.argv.slice(2);
const model = modelArg ?? "gemini-3.8-flash";

// 2. modelos visíveis para a chave
let token = "", models = [];
for (let i = 0; i < 10; i++) {
  const r = await fetch(`${BASE}/models?pageSize=1000${token ? `&pageToken=${token}` : ""}`, { headers });
  const body = await r.text();
  if (!r.ok) { console.log(`listar modelos falhou: HTTP ${r.status} ${safe(body)}`); process.exit(3); }
  const j = JSON.parse(body);
  models.push(...(j.models ?? []));
  token = j.nextPageToken ?? "";
  if (!token) break;
}
const video = models.filter((m) => /gemini/.test(m.name) && (m.supportedGenerationMethods ?? []).includes("generateContent"));
console.log(`modelos com generateContent visíveis para a chave: ${video.length}`);
for (const m of video.filter((m) => /flash|argon|pro/.test(m.name)).slice(0, 25)) console.log(`  ${m.name.replace("models/", "")} · entrada ${m.inputTokenLimit} · saída ${m.outputTokenLimit} · ${m.supportedGenerationMethods.join(",")}`);
const chosen = models.find((m) => m.name === `models/${model}`);
if (!chosen) { console.log(`MODELO ${model}: NÃO disponível para esta chave (nenhum substituto será usado)`); process.exit(4); }
console.log(`MODELO ${model}: disponível · ${chosen.displayName ?? ""} · entrada ${chosen.inputTokenLimit} · saída ${chosen.outputTokenLimit}`);
if (DIRECT_MAX_OUTPUT_TOKENS > (chosen.outputTokenLimit ?? 0)) console.log("ATENÇÃO: teto de saída do app maior que o limite do modelo");

if (!yt) { console.log("(sem vídeo informado: contagem de tokens não feita)"); process.exit(0); }
// 3. contagem de tokens da requisição real (sem gerar resposta)
const r = {
  id: "preflight", athlete_id: "-", media_id: "-", status: "queued", video_type: "highlights",
  youtube_id: yt, video_minutes: Number(minutes), range_start_s: null, range_end_s: null,
  shirt_number: Number(shirt), shirt_color: color, position, category: null, birth_year: null,
  report_locale: "pt-BR", rubric_version: RUBRIC_VERSION, prompt_version: PROMPT_VERSION, model,
};
const job = planJobs(r, 15)[0];
const req = buildVideoRequest(r, job, 1);
const ct = await fetch(`${BASE}/models/${model}:countTokens`, {
  method: "POST", headers,
  body: JSON.stringify({ generateContentRequest: { model: `models/${model}`, contents: req.contents, systemInstruction: req.systemInstruction, generationConfig: req.generationConfig } }),
});
const ctBody = await ct.text();
if (!ct.ok) { console.log(`countTokens recusou a requisição: HTTP ${ct.status} ${safe(ctBody)}`); process.exit(5); }
const total = JSON.parse(ctBody).totalTokens;
const p = priceFor(model);
const est = directMaxCost(model, job.end_s - job.start_s, job.fps);
console.log(`requisição aceita pelo countTokens (formato fileData + YouTube + recorte): ${total} tokens de entrada`);
console.log(`estimativa do app para a entrada: ${est.inputTokens} tokens (${((total / est.inputTokens) * 100).toFixed(0)}% do estimado)`);
console.log(`preço ${model}: US$ ${p.input} entrada / US$ ${p.output} saída por milhão (desde ${p.from})`);
console.log(`custo da entrada real: US$ ${costUsd(model, total, 0, { batch: false })}`);
console.log(`custo máximo com teto de saída (${DIRECT_MAX_OUTPUT_TOKENS}): US$ ${costUsd(model, total, DIRECT_MAX_OUTPUT_TOKENS, { batch: false })}`);
console.log(`custo esperado (~14.000 de saída): US$ ${costUsd(model, total, 14000, { batch: false })}`);
