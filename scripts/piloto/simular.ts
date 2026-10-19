/**
 * SIMULAÇÃO do piloto (sem chamadas, sem custo).
 * Uso: node scripts/piloto/simular.ts <gabarito.json> [outros.json...]
 * Gera em scripts/piloto/saida/<id>/ os pedidos exatos de cada variante
 * (um arquivo JSONL por variante, no formato da Batch API) e mostra o custo estimado.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildConsolidateRequest, buildPartRequest, estimate, MODEL, PILOT_PROMPT_VERSION, validate, variantsFor, type Gabarito } from "./kit.ts";

const here = dirname(fileURLToPath(import.meta.url));
const files = process.argv.slice(2);
if (!files.length) {
  console.error("Uso: node scripts/piloto/simular.ts <gabarito.json> [...]");
  process.exit(2);
}
if (process.env.GEMINI_API_KEY) console.log("Aviso: GEMINI_API_KEY está definida, mas esta simulação NÃO a usa e não faz chamadas.\n");

const usd = (n: number) => `US$ ${n.toFixed(2)}`;
const now2026 = new Date("2026-11-15");
const from2027 = new Date("2027-01-15");
let total26 = 0;
let total27 = 0;
let failed = false;

console.log(`Modelo: ${MODEL} · Batch API · prompt ${PILOT_PROMPT_VERSION}\n`);
for (const file of files) {
  const g = JSON.parse(readFileSync(file, "utf8")) as Gabarito;
  const { errors, warnings } = validate(g);
  console.log(`■ ${g.id} — ${g.video?.duracao_min} min · ${g.video?.tipo}`);
  for (const w of warnings) console.log(`  aviso: ${w}`);
  if (errors.length) {
    for (const e of errors) console.log(`  ERRO: ${e}`);
    failed = true;
    console.log();
    continue;
  }
  const out = join(here, "saida", g.id);
  mkdirSync(out, { recursive: true });
  for (const v of variantsFor(g)) {
    const lines = v.parts.map((p) => JSON.stringify({ key: `${g.id}:${v.id}:${p.seq}`, request: buildPartRequest(g, v, p) }));
    writeFileSync(join(out, `${v.id}.jsonl`), lines.join("\n") + "\n");
    if (v.consolidate) {
      const template = buildConsolidateRequest(g, v.parts.map((p) => ({ ...p, output: "<resposta do trecho>" })));
      writeFileSync(join(out, `${v.id}.consolidacao.modelo.json`), JSON.stringify(template, null, 2));
    }
    const e26 = estimate(v, now2026);
    const e27 = estimate(v, from2027);
    total26 += e26.costUsd;
    total27 += e27.costUsd;
    console.log(`  ${v.id.padEnd(14)} ${v.label}`);
    console.log(`  ${"".padEnd(14)} ${e27.requests} pedido(s) · ~${Math.round(e27.inputTokens / 1000)} mil tokens de entrada · ${usd(e26.costUsd)} (preço 2026) · ${usd(e27.costUsd)} (preço 2027)`);
  }
  console.log(`  pedidos gravados em ${out}\n`);
}
console.log(`Total estimado: ${usd(total26)} (preço até 31/12/2026) · ${usd(total27)} (preço a partir de 2027)`);
console.log(`Com margem de 30% para novas tentativas: ${usd(total26 * 1.3)} · ${usd(total27 * 1.3)}`);
console.log("\nNenhuma chamada foi feita. A execução paga exige autorização expressa e um script separado.");
process.exit(failed ? 1 : 0);
