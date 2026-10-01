/**
 * Slots de mídia da marca. Coloque arquivos licenciados em /public/media e
 * preencha os caminhos abaixo. Enquanto vazios, a interface usa composições
 * cinematográficas geradas em CSS/SVG (leves, sem requisições externas).
 *
 * Vídeo do hero: MP4 H.264 (+ WebM opcional), 1920×1080, 12–20 s em loop,
 * sem áudio, ≤ 6 MB; versão mobile 720p ≤ 2,5 MB. Poster em JPG/AVIF.
 */
export const media = {
  hero: {
    video: null as string | null, // ex.: "/media/hero-1080.mp4"
    videoMobile: null as string | null, // ex.: "/media/hero-720.mp4"
    poster: null as string | null, // ex.: "/media/hero-poster.jpg"
  },
  athletePortrait: null as string | null, // ex.: "/media/athlete-demo.jpg"
};
