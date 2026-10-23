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
export type HeroClip = { src: string; srcMobile?: string; poster?: string; posterMobile?: string };
export type MediaSlotData = { src: string | null; shot: string };

export const media = {
  hero: {
    // Montagem única com cortes secos (Pexels: Kampus Production 8938115, Pressmaster 3192198,
    // Tima Miroshnichenko 6077718). Mobile = recorte 9:16 próprio, plano a plano.
    clips: [
      { src: "/media/hero/hero.mp4", srcMobile: "/media/hero/hero-m.mp4", poster: "/media/hero/hero.jpg", posterMobile: "/media/hero/hero-m.jpg" },
    ] as HeroClip[],
    shot: "Vídeo do hero: montagem de jogos de base",
  },
  /**
   * Cenas de ambientação: quadros do próprio vídeo do hero (mesmos clipes licenciados do
   * Pexels). Usadas só como atmosfera — nunca como foto de atleta cadastrado.
   */
  scenes: {
    bootBall: { src: "/media/cenas/chuteira-bola.jpg", shot: "Chuteira e bola no gramado à noite" } as MediaSlotData,
    duel: { src: "/media/cenas/disputa.jpg", shot: "Disputa de bola em jogo de base" } as MediaSlotData,
    shot: { src: "/media/cenas/finalizacao.jpg", shot: "Camisa 10 finalizando diante do goleiro" } as MediaSlotData,
    stride: { src: "/media/cenas/passada.jpg", shot: "Passada no gramado sob luz de refletor" } as MediaSlotData,
  },
  /** Full bleed "Futebol de base". */
  base: { src: "/media/cenas/disputa.jpg", shot: "Jogo de base, disputa de bola" } as MediaSlotData,
  /** Uma foto por passo de "Como funciona" (vertical 4:5) — sem uso na landing atual (cards sem foto). */
  steps: [
    { src: null, shot: "Responsável e atleta no celular, beira do campo" },
    { src: null, shot: "Atleta em ação: drible ou finalização" },
    { src: null, shot: "Atleta entrando em campo pelo túnel" },
  ] as MediaSlotData[],
  /** Retrato do perfil demonstrativo: sem foto real (perfil fictício). */
  athlete: { src: null, shot: "Retrato do atleta de uniforme, luz lateral" } as MediaSlotData,
  /** Fundo da área profissional. */
  pros: { src: "/media/cenas/passada.jpg", shot: "Passada no gramado sob luz de refletor" } as MediaSlotData,
  /** Encerramento. */
  next: { src: "/media/cenas/finalizacao.jpg", shot: "Camisa 10 finalizando diante do goleiro" } as MediaSlotData,
};
