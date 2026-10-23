/**
 * Preços oficiais do Gemini API (USD por 1 milhão de tokens, plano pago,
 * modo padrão), conferidos em ai.google.dev/gemini-api/docs/pricing em
 * 2026-10-19. A Batch API custa 50% desses valores. Atualize esta tabela
 * quando o Google mudar preços — o custo REAL vem do `usageMetadata` de cada
 * resposta; a tabela só converte tokens em dólares e estima antes do envio.
 */
import type { JobKind } from "./types.ts";

type PricePoint = { from: string; input: number; output: number };

export const PRICES: Record<string, PricePoint[]> = {
  // promocional até 31/12/2026; preço cheio a partir de 01/01/2027
  "gemini-3.8-flash": [
    { from: "2026-01-01", input: 0.75, output: 3.75 },
    { from: "2027-01-01", input: 1.5, output: 7.5 },
  ],
  "gemini-4-argon": [
    { from: "2026-01-01", input: 2, output: 10 },
    { from: "2026-12-01", input: 4, output: 20 },
  ],
  "gemini-3.5-flash-lite": [{ from: "2026-01-01", input: 0.3, output: 2.5 }],
};

export const BATCH_DISCOUNT = 0.5;

/** Tokens por segundo de vídeo em resolução ALTA (258 por quadro + 32 de áudio + metadados). */
export const tokensPerSecond = (fps: number) => Math.round(fps * 258 + 32 + 8);

/** Instruções + rubrica + esquema enviados em cada item (estimativa conservadora). */
const PROMPT_TOKENS = 5000;
/** Saída estimada por item, incluindo o raciocínio interno ("thinking"). */
const OUTPUT_TOKENS: Record<JobKind, number> = { analyze: 14000, segment: 10000, consolidate: 14000 };
/** Entrada da consolidação: instruções + observações de cada trecho. */
const CONSOLIDATE_INPUT_PER_SEGMENT = 2500;

export function priceFor(model: string, at = new Date()): PricePoint {
  const list = PRICES[model];
  if (!list) throw new Error(`preço desconhecido para o modelo ${model}`);
  const day = at.toISOString().slice(0, 10);
  return [...list].reverse().find((p) => p.from <= day) ?? list[0];
}

export function costUsd(model: string, inputTokens: number, outputTokens: number, opts: { batch?: boolean; at?: Date } = {}) {
  const p = priceFor(model, opts.at);
  const raw = (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  return round4(opts.batch === false ? raw : raw * BATCH_DISCOUNT);
}

/** Estimativa antes do envio (usada no controle de orçamento). */
export function estimateJob(model: string, job: { kind: JobKind; start_s: number; end_s: number; fps: number; segments?: number }, at?: Date) {
  const input = job.kind === "consolidate"
    ? PROMPT_TOKENS + (job.segments ?? 1) * CONSOLIDATE_INPUT_PER_SEGMENT
    : PROMPT_TOKENS + (job.end_s - job.start_s) * tokensPerSecond(job.fps);
  return { inputTokens: input, outputTokens: OUTPUT_TOKENS[job.kind], costUsd: costUsd(model, input, OUTPUT_TOKENS[job.kind], { at }) };
}

/** Custo real a partir do uso informado pelo provedor (thinking conta como saída). */
export function costFromUsage(model: string, usage: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }, at?: Date, batch = true) {
  const input = usage.promptTokenCount ?? 0;
  const output = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
  return { inputTokens: input, outputTokens: output, costUsd: costUsd(model, input, output, { at, batch }) };
}

// ---------------------------------------------------------------- chamada direta ("Processar agora")
/** Só melhores momentos de até 10 minutos podem ser processados na hora. */
export const DIRECT_MAX_SECONDS = 600;
/** Teto de saída (resposta + raciocínio) da chamada direta: limita o custo máximo. */
export const DIRECT_MAX_OUTPUT_TOKENS = 32_000;
/** Nenhuma chamada direta é enviada se o custo MÁXIMO possível passar disto. */
export const DIRECT_MAX_USD = 0.5;

/** Custo máximo possível da chamada direta (preço cheio, sem desconto de lote): vídeo inteiro + teto de saída. */
export function directMaxCost(model: string, seconds: number, fps: number, at?: Date) {
  const input = PROMPT_TOKENS + seconds * tokensPerSecond(fps);
  return { inputTokens: input, outputTokens: DIRECT_MAX_OUTPUT_TOKENS, costUsd: costUsd(model, input, DIRECT_MAX_OUTPUT_TOKENS, { at, batch: false }) };
}

export const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
