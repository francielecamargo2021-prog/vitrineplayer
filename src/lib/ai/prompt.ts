/**
 * Montagem das requisições ao Gemini (formato GenerateContentRequest, exigido
 * pela Batch API). Uma requisição por item: nunca há vídeos de atletas
 * diferentes na mesma requisição.
 *
 * Confirmado na documentação oficial (2026-10-19): gemini-3.8-flash é estável,
 * aceita vídeo, saída estruturada e Batch API; URLs do YouTube só funcionam
 * para vídeos PÚBLICOS. O recorte por trecho usa `videoMetadata`
 * (start/endOffset, fps), documentado mas marcado como obsoleto em favor de
 * `processing_options`, ainda sem especificação publicada — isolado em
 * `videoPart()` para troca simples quando o novo campo for documentado.
 */
import { anchors, criteria, groupFor, groupKeys, groups, scoring, type CriterionKey } from "./rubric.ts";
import type { JobKind, ModelOutput, RequestContext } from "./types.ts";

export const PROMPT_VERSION = "prompt-2026.10-v1";

const videoTypeText = {
  highlights: "um vídeo de MELHORES MOMENTOS (lances selecionados pela família; não representa uma partida inteira)",
  full_match: "uma PARTIDA COMPLETA ou trecho contínuo de partida",
  training: "um vídeo de TREINO",
} as const;

export const mmss = (s: number) => {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

const SYSTEM = `Você é um analista técnico de futebol de base. Sua função é uma TRIAGEM PRELIMINAR a partir de um único vídeo, para ajudar profissionais a decidir se vale assistir ao vídeo original. Você não substitui a avaliação humana.

Regras obrigatórias:
1. Avalie SOMENTE o atleta identificado pelo número da camisa, cor do uniforme e posição informados. Identifique-o por esses elementos — nunca por reconhecimento facial.
2. Se não conseguir identificar o atleta com segurança, responda identification.status = "not_found" (ou "uncertain") e NÃO avalie fundamentos: todos com observed=false e score=null.
3. Só atribua nota a um fundamento com pelo menos ${scoring.minEvidence} lances visíveis, cada um com o minuto (MM:SS, na linha do tempo do vídeo original) e uma descrição objetiva. Sem evidência suficiente: observed=false, score=null.
4. Notas de 1 a 5, sempre RELATIVAS À CATEGORIA informada (não ao futebol profissional adulto):
${Object.entries(anchors).map(([k, v]) => `   ${k} = ${v}`).join("\n")}
5. Proibido: avaliações psicológicas, de personalidade, emocionais ou de caráter; previsões de carreira ou de potencial; comparações com jogadores famosos; afirmações sem lance que as sustente; contagens exatas, velocidades ou distâncias.
6. Não descreva nem identifique outras pessoas do vídeo (companheiros, adversários, torcedores); refira-se a elas apenas de forma genérica ("um adversário").
7. Seja específico e honesto. Se o vídeo tiver pouca qualidade, câmera distante ou poucos lances do atleta, diga isso e reduza a confiança.
8. Responda apenas no formato JSON pedido.`;

export function responseSchema(keys: CriterionKey[]) {
  const evidence = {
    type: "object",
    properties: { t: { type: "string", description: "MM:SS na linha do tempo do vídeo original" }, note: { type: "string" } },
    required: ["t", "note"],
  };
  return {
    type: "object",
    properties: {
      identification: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["confirmed", "uncertain", "not_found"] },
          notes: { type: "string" },
          timestamps: { type: "array", items: { type: "string" } },
        },
        required: ["status", "notes", "timestamps"],
      },
      video_quality: { type: "string", enum: ["good", "fair", "poor"] },
      criteria: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string", enum: keys },
            observed: { type: "boolean" },
            score: { type: ["integer", "null"], minimum: 1, maximum: 5 },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            evidence: { type: "array", items: evidence },
            comment: { type: "string" },
          },
          required: ["key", "observed", "score", "confidence", "evidence", "comment"],
        },
      },
      strengths: { type: "array", items: { type: "string" } },
      development: { type: "array", items: { type: "string" } },
      decision_making: { type: ["string", "null"] },
      positioning: { type: ["string", "null"] },
      summary: { type: "string" },
    },
    required: ["identification", "video_quality", "criteria", "strengths", "development", "decision_making", "positioning", "summary"],
  };
}

function athleteBlock(r: RequestContext) {
  const g = groupFor(r.position);
  const keys = groupKeys(g);
  const lang = r.report_locale === "es" ? "espanhol (América Latina)" : "português do Brasil";
  return {
    keys,
    text: `Atleta a avaliar:
- Camisa número ${r.shirt_number}, uniforme ${r.shirt_color}
- Posição: ${r.position} (${groups[g].label.pt})
- Categoria: ${r.category ?? (r.birth_year ? `nascido em ${r.birth_year}` : "não informada")}
- Tipo de vídeo: ${videoTypeText[r.video_type]}

Fundamentos desta posição (avalie apenas estes; chave → o que observar):
${keys.map((k) => `- ${k}: ${criteria[k].label.pt} — ${criteria[k].observe}`).join("\n")}

Escreva todos os textos em ${lang}. Pontos fortes e aspectos a desenvolver: no máximo 4 itens cada, curtos, sempre baseados em lances citados.`,
  };
}

/** Parte de vídeo (YouTube público) recortada no trecho do item. */
export function videoPart(youtubeId: string, startS: number, endS: number, fps: number) {
  return {
    fileData: { fileUri: `https://www.youtube.com/watch?v=${youtubeId}` },
    videoMetadata: { startOffset: `${startS}s`, endOffset: `${endS}s`, fps },
  };
}

const generationConfig = (keys: CriterionKey[], withVideo: boolean) => ({
  responseMimeType: "application/json",
  responseJsonSchema: responseSchema(keys),
  thinkingConfig: { thinkingLevel: "medium" },
  ...(withVideo ? { mediaResolution: "MEDIA_RESOLUTION_HIGH" } : {}),
});

/** Item com vídeo: análise completa ("analyze") ou parcial de um trecho ("segment"). */
export function buildVideoRequest(r: RequestContext, job: { kind: JobKind; start_s: number; end_s: number; fps: number; seq: number }, totalSegments: number) {
  const { keys, text } = athleteBlock(r);
  const scope = job.kind === "segment"
    ? `Este é o TRECHO ${job.seq + 1} de ${totalSegments} (de ${mmss(job.start_s)} a ${mmss(job.end_s)}). Avalie só o que aparece neste trecho; as observações serão consolidadas depois.`
    : `Analise o vídeo de ${mmss(job.start_s)} a ${mmss(job.end_s)}.`;
  return {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [videoPart(r.youtube_id, job.start_s, job.end_s, job.fps), { text: `${scope}\n\n${text}` }] }],
    generationConfig: generationConfig(keys, true),
  };
}

/** Item final (somente texto): consolida as observações dos trechos em um relatório. */
export function buildConsolidateRequest(r: RequestContext, segments: { seq: number; start_s: number; end_s: number; output: ModelOutput }[]) {
  const { keys, text } = athleteBlock(r);
  const body = segments
    .sort((a, b) => a.seq - b.seq)
    .map((s) => `### Trecho ${s.seq + 1} (${mmss(s.start_s)}–${mmss(s.end_s)})\n${JSON.stringify(s.output)}`)
    .join("\n\n");
  return {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{
      role: "user",
      parts: [{
        text: `Consolide as observações abaixo, feitas por trechos do MESMO vídeo e do MESMO atleta, em uma avaliação única.
- Use somente as evidências citadas nos trechos (mantenha os minutos originais). Não invente lances.
- Identificação: "confirmed" apenas se o atleta foi identificado de forma consistente; trechos em que não foi identificado não contam.
- Nota por fundamento: considere todos os lances citados; se o total de lances for menor que ${scoring.minEvidence}, observed=false e score=null.

${text}

${body}`,
      }],
    }],
    generationConfig: generationConfig(keys, false),
  };
}
