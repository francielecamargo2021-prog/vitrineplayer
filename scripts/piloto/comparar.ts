/**
 * Compara a resposta de uma variante com o gabarito (sem chamadas).
 * Uso: node scripts/piloto/comparar.ts <gabarito.json> <resultado.json>
 * resultado.json = { "variante": "baixa-inteira", "final": <JSON da IA>, "trechos"?: [{ seq, start_s, end_s, output }] }
 * Grava a planilha de conferência dos minutos em scripts/piloto/saida/<id>/conferencia-<variante>.csv
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checklistCsv, compare, variantsFor, type Gabarito, type PilotOutput } from "./kit.ts";

const here = dirname(fileURLToPath(import.meta.url));
const [gFile, rFile] = process.argv.slice(2);
if (!gFile || !rFile) {
  console.error("Uso: node scripts/piloto/comparar.ts <gabarito.json> <resultado.json>");
  process.exit(2);
}
const g = JSON.parse(readFileSync(gFile, "utf8")) as Gabarito;
const r = JSON.parse(readFileSync(rFile, "utf8")) as { variante: string; final: PilotOutput; trechos?: { seq: number; start_s: number; end_s: number; output: PilotOutput }[] };
const v = variantsFor(g).find((x) => x.id === r.variante);
if (!v) {
  console.error(`variante "${r.variante}" não existe para este vídeo`);
  process.exit(2);
}
const c = compare(g, v, r.final, r.trechos ?? []);
const label: Record<string, string> = { right: "direito", left: "esquerdo", both: "ambos", center: "centro" };
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
console.log(`■ ${g.id} · variante ${c.variant}: ${c.aprovado ? "APROVADA" : "REPROVADA"}`);
console.log(`  Identificação: ${c.identificacao.status} (${c.identificacao.momentos} momentos com número legível)`);
for (const x of c.conferencia) console.log(`  ${x.item.padEnd(8)} verdade ${(label[x.verdade] ?? x.verdade).padEnd(8)} · IA: ${x.status} ${x.observado ?? ""} → ${x.resultado}`);
console.log(`  Lances de referência encontrados: ${c.lances.achados5s}/${c.lances.referencia} (±5 s) · ${c.lances.achados10s}/${c.lances.referencia} (±10 s)`);
console.log(`  Minutos citados pela IA: ${c.lances.citados} · inválidos/fora do vídeo: ${c.lances.foraDoVideo}${c.lances.possivelMinutagemRelativa ? " · ATENÇÃO: minutagem relativa ao trecho" : ""}`);
const missing = c.notas.detalhes.filter((d) => d.ia === null).length;
console.log(`  Notas comparadas: ${c.notas.comparadas}${missing ? ` · ${missing} fundamento(s) avaliados pelo treinador e não observados pela IA` : ""} · diferença média ${c.notas.diferencaMedia ?? "—"} · até 1 ponto: ${pct(c.notas.ate1Ponto)}`);
for (const d of c.notas.detalhes) console.log(`    ${d.chave.padEnd(18)} IA ${d.ia ?? "não observado"} · treinador ${d.treinador}`);
if (c.conteudoProibido.length) console.log(`  Revisar (possível conteúdo proibido):\n${c.conteudoProibido.map((t) => `    - ${t}`).join("\n")}`);
if (c.motivos.length) console.log(`  Motivos:\n${c.motivos.map((m) => `    - ${m}`).join("\n")}`);
const out = join(here, "saida", g.id);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, `conferencia-${c.variant}.csv`), checklistCsv(g, r.final));
writeFileSync(join(out, `comparacao-${c.variant}.json`), JSON.stringify(c, null, 2));
console.log(`  Planilha para o treinador conferir cada minuto: ${join(out, `conferencia-${c.variant}.csv`)}`);
