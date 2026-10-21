import type { Metadata } from "next";

/**
 * Só a produção pode aparecer em buscadores. Homologação, prévias e ambiente local
 * ficam fora (robots.txt, meta robots e cabeçalho X-Robots-Tag em next.config.ts).
 */
export const indexable = process.env.VP_ENV === "production";

/** Áreas privadas/protótipo: nunca indexar. */
export const privateMetadata: Metadata = { robots: { index: false, follow: false, nocache: true } };
