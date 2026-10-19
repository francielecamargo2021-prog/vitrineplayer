import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPartRequest, compare, estimate, validate, variantsFor, type Gabarito, type PilotOutput } from "./kit.ts";

const example = JSON.parse(readFileSync(new URL("./gabarito.exemplo.json", import.meta.url), "utf8")) as Gabarito;
const clone = (g: Gabarito): Gabarito => JSON.parse(JSON.stringify(g));

function perfect(g: Gabarito): PilotOutput {
  const ev = (t: string) => ({ t, nota: "lance" });
  return {
    identificacao: { status: "confirmado", momentos: ["03:15", "12:30"], notas: "número legível" },
    conferencia: [
      { item: "camisa", informado: "10", observado: "10", status: "confirmado", evidencias: [ev("03:15"), ev("12:30")] },
      { item: "posicao", informado: "RW", observado: "RW", status: "confirmado", evidencias: [ev("08:40"), ev("24:50")] },
      { item: "pe", informado: "esquerdo", observado: "esquerdo", status: "confirmado", evidencias: [ev("17:05"), ev("78:45")] },
      { item: "lado", informado: "direito", observado: "direito", status: "confirmado", evidencias: [ev("41:10"), ev("52:35")] },
    ],
    fundamentos: Object.entries(g.notas_treinador!.notas).map(([chave, nota]) => ({
      chave, observado: true, nota: nota as number, explicacao: "Executa bem pelo lado direito.",
      evidencias: g.lances_referencia.filter((l) => l.fundamento === chave).map((l) => ev(l.t)).concat(ev("63:00")),
    })),
    pontos_fortes: ["Corte para dentro com a perna esquerda"],
    desenvolvimento: ["Tomada de decisão no último terço"],
    limitacoes: ["Câmera aberta em parte do segundo tempo"],
    parecer: "Ponta de pé esquerdo que atua pela direita.",
  };
}

test("partida de 92 min gera as duas variantes: baixa inteira e alta por trechos", () => {
  const [low, high] = variantsFor(example);
  assert.equal(low.id, "baixa-inteira");
  assert.equal(low.parts.length, 1);
  assert.equal(low.resolution, "low");
  assert.equal(high.id, "alta-trechos");
  assert.equal(high.parts.length, 7);
  assert.equal(high.parts.at(-1)!.end_s, 92 * 60);
  assert.ok(high.consolidate);
});

test("vídeo curto gera alta × baixa com 2 quadros/s", () => {
  const g = clone(example);
  g.video.duracao_min = 5;
  g.video.tipo = "highlights";
  g.lances_referencia = [];
  const vs = variantsFor(g);
  assert.deepEqual(vs.map((v) => v.id), ["alta", "baixa"]);
  assert.ok(vs.every((v) => v.parts[0].fps === 2));
});

test("pedido usa o objeto processing, dados declarados e nenhum dado pessoal", () => {
  const [low, high] = variantsFor(example);
  const r = buildPartRequest(example, high, high.parts[2]);
  const video = r.contents[0].parts[0] as { fileData: { fileUri: string }; processing: Record<string, unknown> };
  assert.deepEqual(video.processing, { type: "static", start_offset: 1800, end_offset: 2700, fps: 1 });
  assert.ok(!("videoMetadata" in video));
  assert.equal(r.generationConfig.mediaResolution, "MEDIA_RESOLUTION_HIGH");
  assert.equal(buildPartRequest(example, low, low.parts[0]).generationConfig.mediaResolution, "MEDIA_RESOLUTION_LOW");
  const text = JSON.stringify(r);
  assert.match(text, /Pé dominante: esquerdo; lado de atuação: direito/);
  assert.match(text, /NÃO são fatos observados/);
  assert.match(text, /DIREÇÃO DE ATAQUE DO TIME DO ATLETA/);
  assert.match(text, /TRECHO 3 de 7/);
  assert.doesNotMatch(text, /exemplo-partida|EXEMPLO FICTÍCIO|autoriza/);
});

test("vídeo de menor sem autorização registrada não é simulado", () => {
  const g = clone(example);
  g.menor = true;
  assert.ok(validate(g).errors.some((e) => e.includes("autorização")));
  g.autorizacao = { responsavel: "Responsável Teste", data: "2026-10-20", documento: "termo-01.pdf" };
  assert.equal(validate(g).errors.length, 0);
});

test("estimativa: partida inteira em baixa custa menos da metade da alta por trechos", () => {
  const [low, high] = variantsFor(example);
  const at = new Date("2027-02-01");
  const l = estimate(low, at);
  const h = estimate(high, at);
  assert.ok(l.costUsd > 0.4 && l.costUsd < 0.55, `baixa ${l.costUsd}`);
  assert.ok(h.costUsd > 1.4 && h.costUsd < 1.8, `alta ${h.costUsd}`);
  assert.equal(h.requests, 8);
  assert.ok(estimate(low, new Date("2026-11-01")).costUsd < l.costUsd);
});

test("comparação: resposta coerente com o gabarito é aprovada", () => {
  const c = compare(example, variantsFor(example)[0], perfect(example));
  assert.equal(c.aprovado, true, c.motivos.join("; "));
  assert.equal(c.lances.achados5s, 10);
  assert.equal(c.notas.diferencaMedia, 0);
  assert.ok(c.conferencia.every((x) => x.resultado === "acerto"));
});

test("comparação: lado e pé trocados (o erro do teste no AI Studio) reprovam", () => {
  const out = perfect(example);
  out.conferencia[2] = { ...out.conferencia[2], observado: "direito", status: "divergente" };
  out.conferencia[3] = { ...out.conferencia[3], observado: "esquerdo", status: "confirmado" };
  const c = compare(example, variantsFor(example)[0], out);
  assert.equal(c.aprovado, false);
  assert.deepEqual(c.conferencia.filter((x) => x.resultado === "ERRO").map((x) => x.item), ["pe", "lado"]);
});

test("comparação: 'inconclusivo' não conta como erro", () => {
  const out = perfect(example);
  out.conferencia[3] = { ...out.conferencia[3], observado: null, status: "inconclusivo", evidencias: [] };
  const c = compare(example, variantsFor(example)[0], out);
  assert.equal(c.conferencia[3].resultado, "inconclusivo");
  assert.equal(c.aprovado, true, c.motivos.join("; "));
});

test("comparação: detecta minutagem contada do início do trecho", () => {
  const high = variantsFor(example)[1];
  const seg = { seq: 2, start_s: 1800, end_s: 2700, output: perfect(example) };
  seg.output.fundamentos = [{ chave: "crossing", observado: true, nota: 4, explicacao: "", evidencias: [{ t: "02:10", nota: "" }, { t: "11:10", nota: "" }] }];
  seg.output.conferencia = [];
  const c = compare(example, high, perfect(example), [seg]);
  assert.equal(c.lances.possivelMinutagemRelativa, true);
  assert.equal(c.aprovado, false);
});

test("comparação: notas distantes do treinador, minutos fora do vídeo e conteúdo proibido reprovam", () => {
  const out = perfect(example);
  out.fundamentos[0].nota = 1;
  out.fundamentos[1].nota = 1;
  out.fundamentos[0].evidencias.push({ t: "99:00", nota: "" });
  out.parecer = "Tem grande potencial e personalidade forte.";
  const c = compare(example, variantsFor(example)[0], out);
  assert.equal(c.aprovado, false);
  assert.ok(c.notas.diferencaMedia! > 0.9);
  assert.equal(c.lances.foraDoVideo, 1);
  assert.equal(c.conteudoProibido.length, 1);
});
