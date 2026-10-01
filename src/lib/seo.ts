import type { Metadata } from "next";

/** Áreas privadas/protótipo: nunca indexar. */
export const privateMetadata: Metadata = { robots: { index: false, follow: false, nocache: true } };
