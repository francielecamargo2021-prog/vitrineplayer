/**
 * Rubrica de avaliação técnica por IA — versionada.
 *
 * Mudou critério, peso ou âncora? Crie uma NOVA versão (rubric-AAAA.MM-vN):
 * relatórios de versões diferentes não são comparáveis e ficam marcados com a
 * versão usada. Notas de 1 a 5 são sempre relativas à CATEGORIA do atleta
 * (ex.: Sub-15), nunca ao futebol profissional adulto.
 */

export const RUBRIC_VERSION = "rubric-2026.10-v1";

export type Position = "GK" | "RB" | "CB" | "LB" | "DM" | "CM" | "AM" | "RW" | "LW" | "CF" | "ST";
export type PositionGroup = "gk" | "cb" | "fb" | "dm" | "mid" | "wing" | "st";
export type Lang = "pt" | "es";

export type CriterionKey =
  | "first_touch" | "passing" | "dribbling" | "finishing" | "heading" | "crossing"
  | "off_ball_movement" | "link_play" | "vision" | "decision_making" | "positioning"
  | "marking" | "tackling" | "aerial_duels" | "ball_recovery" | "defensive_1v1"
  | "attacking_support" | "build_up" | "shot_stopping" | "handling" | "high_balls" | "distribution";

type Criterion = { label: Record<Lang, string>; observe: string };

/** Catálogo de fundamentos: rótulo exibido + o que a IA deve observar (vai no prompt). */
export const criteria: Record<CriterionKey, Criterion> = {
  first_touch: { label: { pt: "Domínio e recepção", es: "Control y recepción" }, observe: "qualidade do primeiro toque, orientação do domínio, proteção da bola sob pressão" },
  passing: { label: { pt: "Passe", es: "Pase" }, observe: "precisão, peso e escolha de passes curtos e longos; passes que progridem o jogo" },
  dribbling: { label: { pt: "Drible", es: "Regate" }, observe: "condução, mudança de direção e êxito ao superar adversários no 1 contra 1" },
  finishing: { label: { pt: "Finalização", es: "Definición" }, observe: "técnica, direção e escolha do chute; finalizações dentro e fora da área" },
  heading: { label: { pt: "Jogo aéreo ofensivo", es: "Juego aéreo ofensivo" }, observe: "tempo de salto e direção do cabeceio em lances ofensivos" },
  crossing: { label: { pt: "Cruzamento", es: "Centro" }, observe: "qualidade e escolha de cruzamentos e passes para a área" },
  off_ball_movement: { label: { pt: "Movimentação sem bola", es: "Movimiento sin balón" }, observe: "infiltrações, desmarques e ocupação de espaços para receber" },
  link_play: { label: { pt: "Participação na construção", es: "Juego asociado" }, observe: "apoios, tabelas e retenção de bola para ligar o time ao ataque" },
  vision: { label: { pt: "Visão de jogo", es: "Visión de juego" }, observe: "percepção de companheiros livres e passes que quebram linhas" },
  decision_making: { label: { pt: "Tomada de decisão", es: "Toma de decisiones" }, observe: "escolha entre passar, conduzir, finalizar ou proteger, considerando a situação visível" },
  positioning: { label: { pt: "Posicionamento", es: "Posicionamiento" }, observe: "posição em relação à bola, aos companheiros e ao adversário nos lances visíveis" },
  marking: { label: { pt: "Marcação", es: "Marca" }, observe: "acompanhamento do adversário, distância e antecipação" },
  tackling: { label: { pt: "Desarme", es: "Quite" }, observe: "tempo e técnica do desarme, sem falta" },
  aerial_duels: { label: { pt: "Duelo aéreo defensivo", es: "Duelo aéreo defensivo" }, observe: "disputas pelo alto em lances defensivos" },
  ball_recovery: { label: { pt: "Recuperação de bola", es: "Recuperación de balón" }, observe: "interceptações, pressão e retomada da posse" },
  defensive_1v1: { label: { pt: "Defesa no 1 contra 1", es: "Defensa en el 1 contra 1" }, observe: "postura, contenção e êxito contra o atacante direto" },
  attacking_support: { label: { pt: "Apoio ao ataque", es: "Apoyo al ataque" }, observe: "subidas, ultrapassagens e participação ofensiva pelo corredor" },
  build_up: { label: { pt: "Saída de bola", es: "Salida de balón" }, observe: "primeiros passes da defesa, condução e segurança sob pressão" },
  shot_stopping: { label: { pt: "Defesas", es: "Atajadas" }, observe: "reflexo, posicionamento do corpo e técnica nas defesas de chutes" },
  handling: { label: { pt: "Encaixe", es: "Blocaje" }, observe: "segurança ao segurar a bola, rebotes concedidos" },
  high_balls: { label: { pt: "Saídas e bolas altas", es: "Salidas y balones aéreos" }, observe: "saídas do gol, cruzamentos interceptados, comando da área" },
  distribution: { label: { pt: "Reposição e jogo com os pés", es: "Saque y juego con los pies" }, observe: "reposições com mãos e pés, passes curtos e longos do goleiro" },
};

/** Fundamentos e pesos por grupo de posição. */
export const groups: Record<PositionGroup, { label: Record<Lang, string>; weights: Partial<Record<CriterionKey, number>> }> = {
  gk: { label: { pt: "Goleiro", es: "Arquero" }, weights: { shot_stopping: 3, positioning: 2, handling: 2, high_balls: 2, distribution: 2, decision_making: 1 } },
  cb: { label: { pt: "Zagueiro", es: "Defensor central" }, weights: { marking: 3, positioning: 3, aerial_duels: 2, tackling: 2, build_up: 2, decision_making: 1 } },
  fb: { label: { pt: "Lateral", es: "Lateral" }, weights: { defensive_1v1: 2, positioning: 2, attacking_support: 2, crossing: 2, passing: 2, decision_making: 1 } },
  dm: { label: { pt: "Volante", es: "Volante / mediocentro defensivo" }, weights: { positioning: 3, ball_recovery: 2, passing: 3, first_touch: 2, tackling: 1, decision_making: 2 } },
  mid: { label: { pt: "Meio-campista", es: "Mediocampista" }, weights: { passing: 3, vision: 3, first_touch: 2, dribbling: 2, off_ball_movement: 1, decision_making: 2 } },
  wing: { label: { pt: "Ponta", es: "Extremo" }, weights: { dribbling: 3, crossing: 2, finishing: 2, first_touch: 2, off_ball_movement: 2, decision_making: 1 } },
  st: { label: { pt: "Atacante", es: "Delantero" }, weights: { finishing: 3, off_ball_movement: 3, first_touch: 2, heading: 2, link_play: 2, decision_making: 1 } },
};

export function groupFor(position: Position): PositionGroup {
  switch (position) {
    case "GK": return "gk";
    case "CB": return "cb";
    case "RB": case "LB": return "fb";
    case "DM": return "dm";
    case "CM": case "AM": return "mid";
    case "RW": case "LW": return "wing";
    default: return "st";
  }
}

export const groupKeys = (g: PositionGroup) => Object.keys(groups[g].weights) as CriterionKey[];

/** Âncoras da escala (iguais para todos os fundamentos, relativas à categoria). */
export const anchors: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "não executa o fundamento de forma adequada para a categoria nos lances observados",
  2: "executa com dificuldade frequente para a categoria",
  3: "executa de forma adequada e regular para a categoria",
  4: "executa bem e com consistência acima do esperado para a categoria",
  5: "executa com excelência e recorrência, destacando-se claramente na categoria",
};

/** Regras de pontuação aplicadas no servidor (nunca confiamos no cálculo do modelo). */
export const scoring = {
  /** Mínimo de lances citados (com minuto) para um fundamento receber nota. */
  minEvidence: 2,
  /** Cobertura mínima (soma dos pesos observados / total) para existir nota geral. */
  minCoverageForOverall: 0.6,
};
