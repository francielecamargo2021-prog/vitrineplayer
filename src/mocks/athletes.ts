/** Dados 100% fictícios para o protótipo visual. Nenhum atleta real. */
export const demoAthlete = {
  sportName: "Lucas Moreira",
  fullName: "Lucas Andrade Moreira",
  number: "11",
  year: 2011,
  position: "Ponta-direita",
  secondary: "Meia ofensivo",
  foot: "Canhoto",
  height: "1,62 m",
  weight: "49 kg",
  city: "Campinas, SP",
  country: "Brasil",
  nationality: "Brasileira · Italiana",
  club: "EC Horizonte",
  category: "Sub-14",
  federated: true,
  previous: [
    { club: "Atlético Vale Verde", period: "2021 — 2023" },
    { club: "Escola Nova Geração", period: "2018 — 2021" },
  ],
  competitions: ["Paulista Sub-14", "Copa Interior", "Torneio Regional de Base"],
  videos: [
    { title: "Melhores momentos · temporada 2025", duration: "04:12" },
    { title: "Jogo completo · Copa Interior", duration: "61:30" },
    { title: "Treino técnico · finalização", duration: "02:48" },
  ],
  traits: ["Drible curto", "Aceleração", "Leitura de jogo", "Finalização de fora", "Bola parada"],
  achievements: ["Campeão Copa Interior Sub-13 (2024)", "Artilheiro Torneio Regional (2025)"],
  goals: "Seguir evoluindo em categoria de base estruturada e disputar competições nacionais.",
  seeking: ["Clube", "Avaliação", "Representação"],
};

export type ProResult = {
  id: string;
  name: string;
  year: number;
  position: string;
  foot: string;
  city: string;
  country: string;
  club: string;
  federated: boolean;
  video: boolean;
  scores: [number, number, number, number, number];
  tags: string[];
};

export const proResults: ProResult[] = [
  { id: "a1", name: "Lucas Moreira", year: 2011, position: "Ponta-direita", foot: "Canhoto", city: "Campinas, SP", country: "BR", club: "EC Horizonte", federated: true, video: true, scores: [8, 7, 7, 8, 9], tags: ["Prioridade", "Sub-14"] },
  { id: "a2", name: "Mateo Giménez", year: 2012, position: "Centroavante", foot: "Destro", city: "Rosario", country: "AR", club: "Club Ribera", federated: true, video: true, scores: [7, 7, 8, 7, 8], tags: ["Observar"] },
  { id: "a3", name: "Davi Souza", year: 2012, position: "Atacante", foot: "Canhoto", city: "Rio de Janeiro, RJ", country: "BR", club: "Esporte Litoral", federated: true, video: true, scores: [8, 6, 7, 7, 8], tags: [] },
  { id: "a4", name: "Santiago Benítez", year: 2011, position: "Volante", foot: "Destro", city: "Asunción", country: "PY", club: "Sportivo Central", federated: false, video: true, scores: [6, 8, 7, 8, 7], tags: ["Relatório"] },
  { id: "a5", name: "Thiago Rocha", year: 2012, position: "Atacante", foot: "Canhoto", city: "Niterói, RJ", country: "BR", club: "Grêmio Baía", federated: true, video: true, scores: [7, 6, 8, 6, 7], tags: [] },
  { id: "a6", name: "Joaquín Pereira", year: 2010, position: "Zagueiro", foot: "Destro", city: "Montevideo", country: "UY", club: "Atlético Prado", federated: true, video: false, scores: [6, 8, 8, 7, 7], tags: [] },
  { id: "a7", name: "Enzo Ribeiro", year: 2012, position: "Atacante", foot: "Canhoto", city: "São Gonçalo, RJ", country: "BR", club: "Clube Serrano", federated: true, video: true, scores: [7, 7, 6, 7, 8], tags: ["Observar"] },
  { id: "a8", name: "Bruno Castilho", year: 2011, position: "Goleiro", foot: "Destro", city: "Curitiba, PR", country: "BR", club: "Paraná Norte", federated: true, video: true, scores: [7, 7, 8, 8, 7], tags: [] },
];
