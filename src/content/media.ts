/**
 * Slots de mídia da Home. Coloque arquivos LICENCIADOS em /public/media e
 * preencha `src`. Fotos: JPG/AVIF (≥ 2400 px no lado maior). Vídeos de bloco:
 * MP4 H.264 sem áudio, loop curto. Enquanto `src` estiver vazio, o slot mostra
 * um placeholder liso com a descrição da cena (`shot`) — nada ilustrado.
 *
 * HERO — montagem de clipes reais de futebol de base (3–6 s cada): entrada em
 * campo, chuteira, gramado, bola, disputa, drible, passe, gol, goleiro,
 * comemoração, arquibancada, concentração. MP4 H.264, sem áudio, ≤ 2 MB por
 * clipe (desktop) e versão vertical/720p ≤ 900 KB em `srcMobile`; poster por clipe.
 * Grading: contraste alto, verdes profundos, pele natural, pretos densos.
 */
export type HeroClip = { src: string; srcMobile?: string; poster?: string };
export type MediaSlotData = { src: string | null; shot: string };

export const media = {
  hero: {
    clips: [] as HeroClip[],
    // ex.: { src: "/media/hero/01-entrada.mp4", srcMobile: "/media/hero/01-entrada-m.mp4", poster: "/media/hero/01.jpg" },
    shot: "Vídeo do hero: montagem de jogos de base",
  },
  /** Full bleed "Futebol de base" (foto ou vídeo horizontal). */
  base: { src: null, shot: "Jogo de base, plano aberto com disputa de bola" } as MediaSlotData,
  /** Uma foto por passo de "Como funciona" (vertical 4:5). */
  steps: [
    { src: null, shot: "Responsável e atleta no celular, beira do campo" },
    { src: null, shot: "Atleta em ação: drible ou finalização" },
    { src: null, shot: "Atleta entrando em campo pelo túnel" },
  ] as MediaSlotData[],
  /** Retrato do perfil demonstrativo (vertical, atleta fictício/autorizado). */
  athlete: { src: null, shot: "Retrato do atleta de uniforme, luz lateral" } as MediaSlotData,
  /** Fundo da área profissional. */
  pros: { src: null, shot: "Scout na arquibancada observando o jogo" } as MediaSlotData,
  /** Full bleed antes do preço. */
  next: { src: null, shot: "Comemoração de gol do time de base" } as MediaSlotData,
};
