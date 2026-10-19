/**
 * Kit do piloto técnico da análise por IA — SOMENTE SIMULAÇÃO NESTA ETAPA.
 *
 * Monta os pedidos exatos que iriam ao Gemini, estima o custo de cada variante
 * e compara uma resposta (quando existir) com o gabarito de um treinador.
 * Este arquivo não faz chamadas de rede e não importa o cliente pago.
 *
 * Variantes comparadas (decisão aprovada: partidas completas em baixa × alta):
 *  - vídeo até 20 min:  "alta"  (1 pedido, resolução alta)
 *                       "baixa" (1 pedido, resolução baixa)
 *  - partida > 20 min:  "baixa-inteira" (1 pedido, vídeo inteiro, resolução baixa; cabe até 3 h)
 *                       "alta-trechos"  (trechos de 15 min em resolução alta + consolidação só texto;
 *                                        em alta só cabe 1 h por pedido)
 *
 * Formato do vídeo segundo a documentação oficial (conferida em 2026-10-19):
 * recorte e quadros por segundo no objeto `processing` ({ type: "static",
 * start_offset, end_offset, fps }); a documentação não informa a unidade dos
 * offsets (os exemplos sugerem segundos) nem se vale para links do YouTube —
 * é exatamente isso que o piloto confirma.
 */
import { anchors, criteria, groupFor, groupKeys, groups, type CriterionKey, type Position } from "../../src/lib/ai/rubric.ts";
import { costUsd, round4 } from "../../src/lib/ai/pricing.ts";

export const PILOT_PROMPT_VERSION = "piloto-2026.10-p1";
export const MODEL = "gemini-3.8-flash";
export const SEGMENT_S = 15 * 60;
export const SHORT_LIMIT_S = 20 * 60;

// ---------------------------------------------------------------- gabarito
export type Foot = "right" | "left" | "both";
export type Side = "right" | "left" | "center" | "both";
export type VideoKind = "highlights" | "full_match" | "training";

export interface Gabarito {
  id: string;
  descricao?: string;
  menor: boolean;
  autorizacao?: { responsavel?: string; data?: string; documento?: string };
  video: { youtube_id: string; duracao_min: number; tipo: VideoKind; publico_confirmado: boolean };
  atleta: {
    categoria: string;
    camisa: number;
    camisa_cor: string;
    calcao_cor?: string;
    meias_cor?: string;
    time?: string;
    adversario_cor?: string;
    posicao: Position;
    secundarias?: Position[];
    pe: Foot;
    lado: Side;
    lado_por_tempo?: Record<string, Side>;
    momento_referencia?: string;
  };
  lances_referencia: { t: string; acao: string; pe?: Foot; lado?: Side; fundamento?: CriterionKey }[];
  notas_treinador?: { avaliador?: string; notas: Partial<Record<CriterionKey, number>> };
}

const positionsList: Position[] = ["GK", "RB", "CB", "LB", "DM", "CM", "AM", "RW", "LW", "CF", "ST"];

export const toSeconds = (t: string): number | null => {
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(t.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Valida o gabarito. Erros impedem a simulação; avisos só são mostrados. */
export function validate(g: Gabarito) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!g.id) errors.push("id ausente");
  if (!/^[A-Za-z0-9_-]{11}$/.test(g.video?.youtube_id ?? "")) errors.push("video.youtube_id inválido (11 caracteres)");
  if (!(g.video?.duracao_min > 0 && g.video.duracao_min <= 180)) errors.push("video.duracao_min deve estar entre 1 e 180");
  if (!["highlights", "full_match", "training"].includes(g.video?.tipo)) errors.push("video.tipo inválido");
  if (g.menor) {
    const a = g.autorizacao ?? {};
    if (!a.responsavel || !a.data || !a.documento) errors.push("vídeo de menor sem autorização registrada (responsavel, data, documento)");
  }
  if (!g.video?.publico_confirmado) warnings.push("confirme que o vídeo está PÚBLICO no YouTube (não listado e privado não funcionam)");
  const at = g.atleta;
  if (!at || !Number.isInteger(at.camisa) || at.camisa < 0 || at.camisa > 99) errors.push("atleta.camisa inválida");
  if (!at?.camisa_cor) errors.push("atleta.camisa_cor obrigatória");
  if (!positionsList.includes(at?.posicao)) errors.push("atleta.posicao inválida");
  if (!["right", "left", "both"].includes(at?.pe)) errors.push("atleta.pe inválido");
  if (!["right", "left", "center", "both"].includes(at?.lado)) errors.push("atleta.lado inválido");
  if (at?.momento_referencia && toSeconds(at.momento_referencia) === null) errors.push("atleta.momento_referencia deve ser MM:SS");
  const dur = (g.video?.duracao_min ?? 0) * 60;
  for (const l of g.lances_referencia ?? []) {
    const s = toSeconds(l.t);
    if (s === null || s > dur) errors.push(`lance ${l.t} inválido ou fora do vídeo`);
  }
  if ((g.lances_referencia ?? []).length < 10) warnings.push("recomendado: pelo menos 10 lances de referência por vídeo");
  if (!g.notas_treinador || !Object.keys(g.notas_treinador.notas ?? {}).length) warnings.push("sem notas do treinador: a comparação de notas ficará vazia");
  return { errors, warnings };
}

// ---------------------------------------------------------------- variantes
export type Resolution = "low" | "high";
export interface Variant {
  id: "alta" | "baixa" | "baixa-inteira" | "alta-trechos";
  label: string;
  resolution: Resolution;
  parts: { seq: number; start_s: number; end_s: number; fps: number }[];
  consolidate: boolean;
}

export function variantsFor(g: Gabarito): Variant[] {
  const dur = Math.round(g.video.duracao_min * 60);
  if (dur <= SHORT_LIMIT_S) {
    const fps = dur <= 600 ? 2 : 1;
    const part = [{ seq: 0, start_s: 0, end_s: dur, fps }];
    return [
      { id: "alta", label: "Resolução alta, 1 pedido", resolution: "high", parts: part, consolidate: false },
      { id: "baixa", label: "Resolução baixa, 1 pedido", resolution: "low", parts: part, consolidate: false },
    ];
  }
  const n = Math.ceil(dur / SEGMENT_S);
  return [
    { id: "baixa-inteira", label: "Partida inteira, resolução baixa, 1 pedido", resolution: "low", parts: [{ seq: 0, start_s: 0, end_s: dur, fps: 1 }], consolidate: false },
    {
      id: "alta-trechos", label: `Resolução alta, ${n} trechos de 15 min + consolidação`, resolution: "high", consolidate: true,
      parts: Array.from({ length: n }, (_, i) => ({ seq: i, start_s: i * SEGMENT_S, end_s: Math.min(dur, (i + 1) * SEGMENT_S), fps: 1 })),
    },
  ];
}

// ---------------------------------------------------------------- pedidos
const footText: Record<Foot, string> = { right: "direito", left: "esquerdo", both: "ambos" };
const sideText: Record<Side, string> = { right: "direito", left: "esquerdo", center: "centro", both: "ambos os lados" };
const kindText: Record<VideoKind, string> = {
  highlights: "MELHORES MOMENTOS (lances escolhidos; não representa uma partida inteira)",
  full_match: "PARTIDA COMPLETA ou trecho contínuo de partida",
  training: "TREINO",
};

export const SYSTEM = `Você é um analista técnico de futebol de base. Faça uma TRIAGEM PRELIMINAR de um único vídeo para ajudar profissionais a decidir se vale assistir ao original. Você não substitui a avaliação humana.

Regras obrigatórias:
1. Avalie SOMENTE o atleta descrito em "Dados informados pelo responsável". Identifique-o pelo número, pelas cores do uniforme, pelo time e pela posição — nunca por reconhecimento facial.
2. Os dados informados servem para ENCONTRAR o atleta. Eles NÃO são fatos observados. Em "conferencia", diga o que o vídeo mostra: "confirmado" só com pelo menos 2 lances coerentes; "divergente" só com pelo menos 2 lances contrários; caso contrário "inconclusivo".
3. Lado de atuação: descreva em relação à DIREÇÃO DE ATAQUE DO TIME DO ATLETA (lado direito = à direita de quem ataca), nunca pela imagem da câmera. Os times trocam de campo no intervalo. Se não der para saber, "inconclusivo".
4. Pé: só conte lances em que o pé de contato é visível. Na dúvida, não conte.
5. Liste em "identificacao.momentos" os minutos em que o número da camisa está legível. Se não conseguir identificar o atleta com segurança, use "nao_encontrado" ou "incerto" e não avalie fundamentos.
6. Nota de fundamento só com pelo menos 2 lances visíveis, cada um com o minuto MM:SS NA LINHA DO TEMPO DO VÍDEO ORIGINAL (mesmo quando analisar um trecho). Sem evidência suficiente: observado=false e nota=null.
7. Notas de 1 a 5, relativas à categoria informada:
${Object.entries(anchors).map(([k, v]) => `   ${k} = ${v}`).join("\n")}
8. Proibido: avaliação psicológica, de personalidade ou de caráter; previsão de carreira ou de potencial; comparação com jogadores famosos; contagens exatas, velocidades ou distâncias; descrever outras pessoas do vídeo.
9. Em "limitacoes", diga com honestidade o que atrapalhou (câmera distante, cortes, poucos lances, número ilegível).
10. Responda apenas no formato JSON pedido.`;

export function pilotSchema(keys: CriterionKey[]) {
  const ev = { type: "object", properties: { t: { type: "string" }, nota: { type: "string" } }, required: ["t", "nota"] };
  const check = {
    type: "object",
    properties: {
      item: { type: "string", enum: ["camisa", "posicao", "pe", "lado"] },
      informado: { type: "string" },
      observado: { type: ["string", "null"] },
      status: { type: "string", enum: ["confirmado", "divergente", "inconclusivo"] },
      evidencias: { type: "array", items: ev },
    },
    required: ["item", "informado", "observado", "status", "evidencias"],
  };
  return {
    type: "object",
    properties: {
      identificacao: {
        type: "object",
        properties: { status: { type: "string", enum: ["confirmado", "incerto", "nao_encontrado"] }, momentos: { type: "array", items: { type: "string" } }, notas: { type: "string" } },
        required: ["status", "momentos", "notas"],
      },
      conferencia: { type: "array", items: check },
      qualidade_video: { type: "string", enum: ["boa", "regular", "ruim"] },
      fundamentos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            chave: { type: "string", enum: keys },
            observado: { type: "boolean" },
            nota: { type: ["integer", "null"], minimum: 1, maximum: 5 },
            explicacao: { type: "string" },
            evidencias: { type: "array", items: ev },
          },
          required: ["chave", "observado", "nota", "explicacao", "evidencias"],
        },
      },
      pontos_fortes: { type: "array", items: { type: "string" } },
      desenvolvimento: { type: "array", items: { type: "string" } },
      limitacoes: { type: "array", items: { type: "string" } },
      parecer: { type: "string" },
    },
    required: ["identificacao", "conferencia", "qualidade_video", "fundamentos", "pontos_fortes", "desenvolvimento", "limitacoes", "parecer"],
  };
}

function athleteText(g: Gabarito) {
  const a = g.atleta;
  const keys = groupKeys(groupFor(a.posicao));
  const uniform = [`camisa ${a.camisa_cor}`, a.calcao_cor && `calção ${a.calcao_cor}`, a.meias_cor && `meias ${a.meias_cor}`].filter(Boolean).join(", ");
  return {
    keys,
    text: `Dados informados pelo responsável (para encontrar o atleta; NÃO são fatos observados):
- Camisa número ${a.camisa}; uniforme: ${uniform}
- Time no vídeo: ${a.time ?? "não informado"}; cor do adversário: ${a.adversario_cor ?? "não informada"}
- Posição principal: ${a.posicao} (${groups[groupFor(a.posicao)].label.pt}); secundárias: ${a.secundarias?.join(", ") || "nenhuma"}
- Pé dominante: ${footText[a.pe]}; lado de atuação: ${sideText[a.lado]}
- Categoria: ${a.categoria}
- Tipo de vídeo: ${kindText[g.video.tipo]}${a.momento_referencia ? `\n- Momento em que o atleta aparece bem: ${a.momento_referencia}` : ""}

Fundamentos desta posição (avalie apenas estes; chave → o que observar):
${keys.map((k) => `- ${k}: ${criteria[k].label.pt} — ${criteria[k].observe}`).join("\n")}

Em "conferencia", inclua exatamente os itens camisa, posicao, pe e lado.
Pontos fortes e desenvolvimento: até 4 itens cada, curtos, sempre apoiados em lances citados. Escreva em português do Brasil.`,
  };
}

const genConfig = (keys: CriterionKey[], resolution: Resolution | null) => ({
  responseMimeType: "application/json",
  responseJsonSchema: pilotSchema(keys),
  thinkingConfig: { thinkingLevel: "medium" },
  ...(resolution ? { mediaResolution: resolution === "high" ? "MEDIA_RESOLUTION_HIGH" : "MEDIA_RESOLUTION_LOW" } : {}),
});

/** Pedido com vídeo (formato GenerateContentRequest, igual ao exigido pela Batch API). */
export function buildPartRequest(g: Gabarito, v: Variant, part: Variant["parts"][number]) {
  const { keys, text } = athleteText(g);
  const scope = v.parts.length > 1
    ? `Este é o TRECHO ${part.seq + 1} de ${v.parts.length} (de ${mmss(part.start_s)} a ${mmss(part.end_s)} do vídeo original). Avalie só este trecho; os minutos devem seguir a linha do tempo do vídeo ORIGINAL.`
    : `Analise o vídeo de ${mmss(part.start_s)} a ${mmss(part.end_s)}.`;
  return {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{
      role: "user",
      parts: [
        {
          fileData: { fileUri: `https://www.youtube.com/watch?v=${g.video.youtube_id}` },
          processing: { type: "static", start_offset: part.start_s, end_offset: part.end_s, fps: part.fps },
        },
        { text: `${scope}\n\n${text}` },
      ],
    }],
    generationConfig: genConfig(keys, v.resolution),
  };
}

/** Consolidação (só texto) para a variante por trechos; recebe as respostas dos trechos. */
export function buildConsolidateRequest(g: Gabarito, segments: { seq: number; start_s: number; end_s: number; output: unknown }[]) {
  const { keys, text } = athleteText(g);
  const body = segments.map((s) => `### Trecho ${s.seq + 1} (${mmss(s.start_s)}–${mmss(s.end_s)})\n${JSON.stringify(s.output)}`).join("\n\n");
  return {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{
      role: "user",
      parts: [{
        text: `Consolide as observações abaixo (trechos do MESMO vídeo e do MESMO atleta) em uma avaliação única.
- Use só os lances citados nos trechos, mantendo os minutos originais. Não invente lances.
- Trechos em que o atleta não foi identificado não contam. Se a identificação divergir entre trechos, diga isso em "limitacoes".
- Some as evidências da conferência e dos fundamentos de todos os trechos antes de decidir.

${text}

${body}`,
      }],
    }],
    generationConfig: genConfig(keys, null),
  };
}

// ---------------------------------------------------------------- custo
/** Tokens oficiais por quadro: 258 (alta) e 66 (baixa); áudio: 32 por segundo. */
export const tokensPerSecond = (fps: number, r: Resolution) => fps * (r === "high" ? 258 : 66) + 32;
const PROMPT_TOKENS = 5500;
const OUT_SINGLE = 14000;
const OUT_SEGMENT = 10000;
const CONSOLIDATE_IN_PER_SEGMENT = 3000;

export function estimate(v: Variant, at: Date) {
  let input = 0;
  let output = 0;
  for (const p of v.parts) {
    input += PROMPT_TOKENS + (p.end_s - p.start_s) * tokensPerSecond(p.fps, v.resolution);
    output += v.parts.length > 1 ? OUT_SEGMENT : OUT_SINGLE;
  }
  if (v.consolidate) {
    input += PROMPT_TOKENS + v.parts.length * CONSOLIDATE_IN_PER_SEGMENT;
    output += OUT_SINGLE;
  }
  const requests = v.parts.length + (v.consolidate ? 1 : 0);
  return { requests, inputTokens: input, outputTokens: output, costUsd: costUsd(MODEL, input, output, { batch: true, at }) };
}

// ---------------------------------------------------------------- comparação
export interface PilotOutput {
  identificacao: { status: string; momentos: string[]; notas: string };
  conferencia: { item: string; informado: string; observado: string | null; status: string; evidencias: { t: string; nota: string }[] }[];
  fundamentos: { chave: string; observado: boolean; nota: number | null; explicacao: string; evidencias: { t: string; nota: string }[] }[];
  pontos_fortes: string[];
  desenvolvimento: string[];
  limitacoes: string[];
  parecer: string;
}

const truthFor = (g: Gabarito, item: string): string => {
  const a = g.atleta;
  return item === "camisa" ? String(a.camisa) : item === "posicao" ? a.posicao : item === "pe" ? a.pe : item === "lado" ? a.lado : "";
};
const norm = (s: string | null) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const synonyms: Record<string, string> = {
  direito: "right", direita: "right", esquerdo: "left", esquerda: "left", canhoto: "left", destro: "right",
  ambos: "both", "ambos os lados": "both", centro: "center", central: "center",
};
const sameValue = (observed: string | null, truth: string) => {
  const o = norm(observed);
  return o === norm(truth) || synonyms[o] === truth || o.replace(/[^0-9]/g, "") === truth;
};

const FORBIDDEN = [
  /psicol/i, /personalidade/i, /car[aá]ter/i, /emocional/i, /maturidade/i, /potencial/i, /futuro/i, /carreira/i,
  /vai ser|ser[aá] um/i, /lembra (o|um)|parecido com|estilo de [A-Z]/i, /\b\d+(\.\d+)? ?(km\/h|metros|m\/s)\b/i,
];

export interface Comparison {
  variant: string;
  identificacao: { status: string; momentos: number; ok: boolean };
  conferencia: { item: string; verdade: string; observado: string | null; status: string; resultado: "acerto" | "inconclusivo" | "ERRO" }[];
  lances: { referencia: number; achados5s: number; achados10s: number; recall10s: number; citados: number; foraDoVideo: number; possivelMinutagemRelativa: boolean };
  notas: { comparadas: number; diferencaMedia: number | null; ate1Ponto: number | null; detalhes: { chave: string; ia: number | null; treinador: number }[] };
  conteudoProibido: string[];
  aprovado: boolean;
  motivos: string[];
}

/** Compara a resposta final de uma variante com o gabarito. */
export function compare(
  g: Gabarito, variant: Variant, out: PilotOutput,
  segments: { seq: number; start_s: number; end_s: number; output: PilotOutput }[] = [],
): Comparison {
  const motivos: string[] = [];
  const dur = g.video.duracao_min * 60;
  const idOk = out.identificacao.status === "confirmado";
  if (!idOk) motivos.push(`identificação: ${out.identificacao.status}`);

  const conferencia = ["camisa", "posicao", "pe", "lado"].map((item) => {
    const c = out.conferencia.find((x) => x.item === item);
    const verdade = truthFor(g, item);
    const status = c?.status ?? "ausente";
    // no piloto os dados informados SÃO a verdade: "divergente" é sempre erro da IA
    const resultado: "acerto" | "inconclusivo" | "ERRO" =
      status === "inconclusivo" ? "inconclusivo"
        : status === "confirmado" && sameValue(c?.observado ?? null, verdade) ? "acerto"
          : "ERRO";
    if (resultado === "ERRO") motivos.push(`conferência de ${item}: ${status} "${c?.observado ?? "—"}" (verdade: ${verdade})`);
    return { item, verdade, observado: c?.observado ?? null, status, resultado };
  });

  const cited = out.fundamentos.flatMap((f) => f.evidencias.map((e) => toSeconds(e.t))).concat(
    out.conferencia.flatMap((c) => c.evidencias.map((e) => toSeconds(e.t))),
  );
  const valid = cited.filter((s): s is number => s !== null);
  const refs = g.lances_referencia.map((l) => toSeconds(l.t)!).filter((s) => s !== null);
  const near = (tol: number) => refs.filter((r) => valid.some((s) => Math.abs(s - r) <= tol)).length;
  const achados5s = near(5);
  const achados10s = near(10);
  // minutagem dos trechos: num trecho que começa em 30:00, citações entre 00:00 e 15:00 indicam
  // que o modelo contou do início do trecho, e não do vídeo original
  let possivelMinutagemRelativa = false;
  for (const seg of segments.filter((x) => x.start_s > 0)) {
    const times = [...seg.output.fundamentos.flatMap((f) => f.evidencias), ...seg.output.conferencia.flatMap((c) => c.evidencias)]
      .map((e) => toSeconds(e.t)).filter((t): t is number => t !== null);
    const inside = times.filter((t) => t >= seg.start_s - 5 && t <= seg.end_s + 5).length;
    const relative = times.filter((t) => t <= seg.end_s - seg.start_s + 5).length;
    if (times.length >= 2 && inside < times.length / 2 && relative > times.length / 2) possivelMinutagemRelativa = true;
  }
  if (possivelMinutagemRelativa) motivos.push("minutagem parece contar do início do trecho, não do vídeo original");
  const recall10s = refs.length ? Math.round((achados10s / refs.length) * 100) / 100 : 0;

  const coach = g.notas_treinador?.notas ?? {};
  const detalhes = Object.entries(coach).map(([chave, treinador]) => ({
    chave, treinador: treinador as number, ia: out.fundamentos.find((f) => f.chave === chave && f.observado)?.nota ?? null,
  }));
  const comparable = detalhes.filter((d) => d.ia !== null);
  const diffs = comparable.map((d) => Math.abs((d.ia as number) - d.treinador));
  const diferencaMedia = diffs.length ? round4(diffs.reduce((a, b) => a + b, 0) / diffs.length) : null;
  const ate1Ponto = diffs.length ? round4(diffs.filter((d) => d <= 1).length / diffs.length) : null;
  if (diferencaMedia !== null && diferencaMedia > 1) motivos.push(`diferença média de nota ${diferencaMedia} (> 1 ponto)`);

  const texts = [out.parecer, ...out.pontos_fortes, ...out.desenvolvimento, ...out.fundamentos.map((f) => f.explicacao)];
  const conteudoProibido = texts.filter((t) => FORBIDDEN.some((re) => re.test(t)));
  if (conteudoProibido.length) motivos.push(`${conteudoProibido.length} trecho(s) com possível conteúdo proibido (revisar)`);

  const foraDoVideo = valid.filter((s) => s > dur).length + (cited.length - valid.length);
  if (foraDoVideo) motivos.push(`${foraDoVideo} minuto(s) inválido(s) ou fora do vídeo`);

  return {
    variant: variant.id,
    identificacao: { status: out.identificacao.status, momentos: out.identificacao.momentos.length, ok: idOk },
    conferencia,
    lances: { referencia: refs.length, achados5s, achados10s, recall10s, citados: cited.length, foraDoVideo, possivelMinutagemRelativa },
    notas: { comparadas: comparable.length, diferencaMedia, ate1Ponto, detalhes },
    conteudoProibido,
    aprovado: motivos.length === 0,
    motivos,
  };
}

/** Planilha para o treinador conferir cada minuto citado (link direto ao lance). */
export function checklistCsv(g: Gabarito, out: PilotOutput) {
  const rows = [["origem", "minuto", "link", "descricao_da_ia", "confere (sim/nao)"]];
  const link = (t: string) => {
    const s = toSeconds(t);
    return s === null ? "" : `https://www.youtube.com/watch?v=${g.video.youtube_id}&t=${s}s`;
  };
  for (const f of out.fundamentos) for (const e of f.evidencias) rows.push([`fundamento:${f.chave}`, e.t, link(e.t), e.nota, ""]);
  for (const c of out.conferencia) for (const e of c.evidencias) rows.push([`conferencia:${c.item}`, e.t, link(e.t), e.nota, ""]);
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}
