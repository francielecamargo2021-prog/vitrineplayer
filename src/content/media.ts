/**
 * Slots de mídia da marca. Coloque arquivos LICENCIADOS em /public/media e
 * preencha os caminhos abaixo. Enquanto vazios, a interface usa composições
 * cinematográficas geradas em CSS/SVG (leves, sem requisições externas).
 *
 * HERO REEL — clipes curtos de futebol de base, tocados em sequência com
 * corte em crossfade (como uma montagem editada):
 *  - 4 a 8 clipes de 3–6 s: entrada em campo, drible, passe, gol, defesa,
 *    comemoração, detalhes (chuteira, bola, gramado), concentração;
 *  - MP4 H.264, sem áudio, 1920×1080 (≤ 2 MB por clipe) e versão mobile
 *    vertical ou 720p (≤ 900 KB) em `srcMobile`;
 *  - poster JPG/AVIF do primeiro frame de cada clipe;
 *  - grading escuro e dessaturado combina com a identidade (sem verdes saturados).
 * Alternativa: um único vídeo já editado em `clips[0]` (12–20 s em loop).
 */
export type HeroClip = {
  src: string;
  srcMobile?: string;
  poster?: string;
};

export const media = {
  hero: {
    clips: [] as HeroClip[],
    // ex.: { src: "/media/hero/01-entrada.mp4", srcMobile: "/media/hero/01-entrada-m.mp4", poster: "/media/hero/01.jpg" },
  },
  /** Blocos fotográficos em tela cheia entre as seções (JPG/AVIF ≥ 2400 px). */
  stills: {
    manifesto: null as string | null, // ex.: "/media/stills/vestiario.jpg"
    pitch: null as string | null, // ex.: "/media/stills/gramado.jpg"
  },
  athletePortrait: null as string | null, // ex.: "/media/athlete-demo.jpg"
};
