/**
 * Prévia do Scout Premium (demonstração). Nada aqui está funcionando ainda, exceto o que
 * está marcado como "Já funciona". Sem preço e sem cobrança: a monetização será definida depois.
 */
export type PremiumStatus = "ready" | "planned";
export type PremiumItem = { title: string; body: string; status: PremiumStatus; needs?: string };

type Copy = {
  badge: string; title: string; lead: string; disclaimer: string;
  statusLabel: Record<PremiumStatus, string>; needsLabel: string;
  basicTitle: string; basicItems: PremiumItem[]; basicLink: string;
  premiumTitle: string; premiumItems: PremiumItem[];
  compareTitle: string; compareLead: string; compareFictional: string; compareCols: [string, string];
  compareRows: { label: string; a: number | null; b: number | null }[]; compareNote: string;
  neverTitle: string; neverItems: string[];
  pricingTitle: string; pricingBody: string;
};

export const scoutPremium: Record<"pt" | "es", Copy> = {
  pt: {
    badge: "Prévia · demonstração",
    title: "Scout Premium",
    lead: "Como o relatório profissional para clubes e empresários vai se apoiar na avaliação básica que a VitrinePlayer já gera.",
    disclaimer: "Esta página é uma demonstração. O Scout Premium ainda não existe: nenhum item marcado como \"Planejado\" funciona hoje. Não há preço definido e nada é cobrado. Os números de exemplo são fictícios.",
    statusLabel: { ready: "Já funciona", planned: "Planejado" },
    needsLabel: "Depende de",
    basicTitle: "Base: avaliação incluída no cadastro",
    basicItems: [
      { status: "ready", title: "Avaliação técnica e tática por fundamento", body: "Nota de 1 a 5, relativa à categoria, com justificativa e os minutos dos lances confirmados no vídeo." },
      { status: "ready", title: "Identificação pela camisa, cor e posição", body: "Sem reconhecimento facial. Se o atleta não for identificado com segurança, não há nota." },
      { status: "ready", title: "Confiança e cobertura", body: "O relatório mostra o que não pôde ser confirmado em vez de completar com suposições." },
      { status: "ready", title: "A família decide", body: "O relatório só aparece para profissionais aprovados se o responsável publicar." },
    ],
    basicLink: "Ver um relatório de exemplo (dados fictícios)",
    premiumTitle: "O que o Scout Premium vai acrescentar",
    premiumItems: [
      { status: "planned", title: "Análise por fundamento mais aprofundada", body: "Mais lances por fundamento, com o contexto de cada um (pressão, setor do campo, resultado da jogada).", needs: "vídeos mais longos e validação da precisão em partidas completas" },
      { status: "planned", title: "Comportamento com e sem bola", body: "Separar o que o atleta faz com a posse do que faz para recebê-la ou recuperá-la.", needs: "partida completa ou trecho contínuo, não só melhores momentos" },
      { status: "planned", title: "Posicionamento e leitura de jogo", body: "Ocupação de espaço e escolhas nos lances em que o atleta e a bola aparecem juntos na imagem.", needs: "câmera aberta; o vídeo precisa mostrar o atleta fora do lance" },
      { status: "planned", title: "Comparação entre avaliações do mesmo atleta", body: "Lado a lado, só entre avaliações com a mesma versão da rubrica e o mesmo tipo de vídeo.", needs: "pelo menos duas avaliações comparáveis" },
      { status: "planned", title: "Histórico de evolução", body: "Linha do tempo das avaliações, sempre indicando o tipo de vídeo de cada uma.", needs: "avaliações ao longo de meses" },
      { status: "planned", title: "Relatório profissional para clubes e empresários", body: "Documento para compartilhar, com o parecer de um analista humano sobre a triagem da IA.", needs: "fluxo de revisão por analista e regras de compartilhamento" },
    ],
    compareTitle: "Como será a comparação",
    compareLead: "Ilustração do formato. Só fundamentos com lances suficientes nas duas avaliações recebem nota lado a lado.",
    compareFictional: "Atleta fictício · dados fictícios",
    compareCols: ["Mar/2026 · melhores momentos", "Out/2026 · melhores momentos"],
    compareRows: [
      { label: "Drible", a: 3, b: 4 },
      { label: "Finalização", a: 3, b: 4 },
      { label: "Cruzamento", a: 3, b: 3 },
      { label: "Domínio e recepção", a: 4, b: 4 },
      { label: "Movimentação sem bola", a: null, b: 3 },
    ],
    compareNote: "Traço = não confirmado naquela avaliação (menos de 2 lances). Não há comparação com outros atletas nem com jogadores famosos.",
    neverTitle: "O que não vamos medir",
    neverItems: [
      "Velocidade, distância percorrida ou contagens exatas: um vídeo comum não permite medir isso com confiança.",
      "Avaliações psicológicas, de personalidade ou de caráter.",
      "Previsões de carreira ou de potencial.",
      "Comparações com jogadores famosos.",
    ],
    pricingTitle: "Preço",
    pricingBody: "Ainda não definido. Nenhuma cobrança está ativa na plataforma.",
  },
  es: {
    badge: "Vista previa · demostración",
    title: "Scout Premium",
    lead: "Cómo el informe profesional para clubes y representantes se va a apoyar en la evaluación básica que VitrinePlayer ya genera.",
    disclaimer: "Esta página es una demostración. Scout Premium todavía no existe: ningún ítem marcado como \"Planificado\" funciona hoy. No hay precio definido y no se cobra nada. Los números de ejemplo son ficticios.",
    statusLabel: { ready: "Ya funciona", planned: "Planificado" },
    needsLabel: "Depende de",
    basicTitle: "Base: evaluación incluida en el registro",
    basicItems: [
      { status: "ready", title: "Evaluación técnica y táctica por fundamento", body: "Nota de 1 a 5, relativa a la categoría, con justificación y los minutos de las jugadas confirmadas en el video." },
      { status: "ready", title: "Identificación por camiseta, color y posición", body: "Sin reconocimiento facial. Si el atleta no se identifica con seguridad, no hay nota." },
      { status: "ready", title: "Confianza y cobertura", body: "El informe muestra lo que no pudo confirmarse en lugar de completarlo con suposiciones." },
      { status: "ready", title: "La familia decide", body: "El informe solo aparece para profesionales aprobados si el responsable lo publica." },
    ],
    basicLink: "Ver un informe de ejemplo (datos ficticios)",
    premiumTitle: "Lo que Scout Premium va a agregar",
    premiumItems: [
      { status: "planned", title: "Análisis por fundamento más profundo", body: "Más jugadas por fundamento, con el contexto de cada una (presión, sector del campo, resultado).", needs: "videos más largos y validación de la precisión en partidos completos" },
      { status: "planned", title: "Comportamiento con y sin balón", body: "Separar lo que el atleta hace con la posesión de lo que hace para recibirla o recuperarla.", needs: "partido completo o tramo continuo, no solo mejores momentos" },
      { status: "planned", title: "Posicionamiento y lectura de juego", body: "Ocupación de espacios y decisiones en las jugadas donde el atleta y el balón aparecen juntos.", needs: "cámara abierta; el video debe mostrar al atleta fuera de la jugada" },
      { status: "planned", title: "Comparación entre evaluaciones del mismo atleta", body: "Lado a lado, solo entre evaluaciones con la misma versión de la rúbrica y el mismo tipo de video.", needs: "al menos dos evaluaciones comparables" },
      { status: "planned", title: "Historial de evolución", body: "Línea de tiempo de las evaluaciones, siempre indicando el tipo de video de cada una.", needs: "evaluaciones a lo largo de meses" },
      { status: "planned", title: "Informe profesional para clubes y representantes", body: "Documento para compartir, con el parecer de un analista humano sobre la evaluación de la IA.", needs: "flujo de revisión por analista y reglas para compartir" },
    ],
    compareTitle: "Cómo será la comparación",
    compareLead: "Ilustración del formato. Solo los fundamentos con jugadas suficientes en las dos evaluaciones reciben nota lado a lado.",
    compareFictional: "Atleta ficticio · datos ficticios",
    compareCols: ["Mar/2026 · mejores momentos", "Oct/2026 · mejores momentos"],
    compareRows: [
      { label: "Regate", a: 3, b: 4 },
      { label: "Definición", a: 3, b: 4 },
      { label: "Centro", a: 3, b: 3 },
      { label: "Control y recepción", a: 4, b: 4 },
      { label: "Movimiento sin balón", a: null, b: 3 },
    ],
    compareNote: "Guion = no confirmado en esa evaluación (menos de 2 jugadas). No hay comparación con otros atletas ni con jugadores famosos.",
    neverTitle: "Lo que no vamos a medir",
    neverItems: [
      "Velocidad, distancia recorrida o conteos exactos: un video común no permite medirlo con confianza.",
      "Evaluaciones psicológicas, de personalidad o de carácter.",
      "Predicciones de carrera o de potencial.",
      "Comparaciones con jugadores famosos.",
    ],
    pricingTitle: "Precio",
    pricingBody: "Todavía no definido. No hay ningún cobro activo en la plataforma.",
  },
};
