/**
 * Avaliação por IA DEMONSTRATIVA (dados fictícios) para o mockup do perfil.
 * Passa pelo mesmo código de validação e notas do processador real.
 */
import { buildReport, parseModelOutput } from "@/lib/ai/report";
import { groupKeys, RUBRIC_VERSION } from "@/lib/ai/rubric";
import { PROMPT_VERSION } from "@/lib/ai/prompt";
import type { AiReportRow } from "@/components/ai/AiReport";

const ev = (a: string, na: string, b: string, nb: string) => [{ t: a, note: na }, { t: b, note: nb }];

const output = {
  identification: { status: "confirmed", notes: "Camisa 11 azul visível em todos os lances.", timestamps: ["00:08"] },
  video_quality: "good",
  criteria: [
    { key: "dribbling", observed: true, score: 4, confidence: "high", evidence: ev("00:14", "Supera o lateral com corte para dentro", "01:52", "Conduz em velocidade e passa por dois marcadores"), comment: "Drible curto eficiente em espaço reduzido." },
    { key: "crossing", observed: true, score: 3, confidence: "medium", evidence: ev("00:41", "Cruzamento rasteiro para a área", "02:30", "Cruzamento alto que passa do segundo pau"), comment: "Boa escolha, execução irregular." },
    { key: "finishing", observed: true, score: 4, confidence: "medium", evidence: ev("01:05", "Finaliza de primeira no canto", "03:12", "Chute de fora da área no gol"), comment: "" },
    { key: "first_touch", observed: true, score: 4, confidence: "medium", evidence: ev("00:22", "Domínio orientado já em progressão", "02:48", "Recepção sob pressão de costas"), comment: "" },
    { key: "off_ball_movement", observed: true, score: 3, confidence: "low", evidence: [{ t: "01:30", note: "Infiltração nas costas da defesa" }], comment: "Poucos lances sem bola no vídeo." },
    { key: "decision_making", observed: true, score: 3, confidence: "medium", evidence: ev("01:52", "Opta por finalizar com companheiro livre", "02:30", "Escolhe o cruzamento no momento certo"), comment: "" },
  ],
  strengths: ["Drible curto em espaço reduzido", "Finalização com a perna esquerda", "Domínio orientado para progredir"],
  development: ["Regularidade nos cruzamentos", "Movimentação sem bola pouco observada no vídeo"],
  decision_making: "Nas jogadas vistas, costuma escolher bem entre driblar e finalizar; em um lance (01:52) finalizou com um companheiro livre.",
  positioning: null,
  summary: "Ponta canhoto com bom drible curto e finalização nos lances selecionados. Por serem melhores momentos, recomenda-se assistir a uma partida completa para avaliar a participação sem bola e a regularidade.",
};

const request = {
  id: "demo", athlete_id: "demo", media_id: "demo", status: "completed" as const, video_type: "highlights" as const,
  youtube_id: "aqz-KE-bpKQ", video_minutes: 4, range_start_s: null, range_end_s: null, shirt_number: 11, shirt_color: "azul",
  position: "RW" as const, category: "Sub-15", birth_year: 2011, report_locale: "pt-BR" as const,
  rubric_version: RUBRIC_VERSION, prompt_version: PROMPT_VERSION, model: "gemini-3.8-flash",
};

const outcome = buildReport(parseModelOutput(JSON.stringify(output), groupKeys("wing"), { start: 0, end: 240 }), request, { start_s: 0, end_s: 240, segments: 1 });
if (outcome.kind !== "report") throw new Error("demo inválida");
const r = outcome.report;

export const demoAiReport: AiReportRow = {
  id: "demo", video_type: r.video_type, position: r.position, category: r.category, rubric_version: r.rubric_version, model: r.model,
  overall_score: r.overall_score, coverage: r.coverage, confidence: r.confidence, summary: r.summary, strengths: r.strengths,
  development: r.development, decision_notes: r.decision_notes, positioning_notes: r.positioning_notes,
  published_at: "2026-10-19T12:00:00Z", created_at: "2026-10-19T12:00:00Z", report: r.report,
};
