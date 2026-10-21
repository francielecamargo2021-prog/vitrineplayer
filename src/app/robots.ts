import type { MetadataRoute } from "next";
import { indexable } from "@/lib/seo";

/**
 * Produção: só a home e as páginas públicas são indexáveis; áreas de atleta, cadastro e
 * portal nunca. Fora da produção (homologação, prévias): nada é indexado.
 */
export default function robots(): MetadataRoute.Robots {
  if (!indexable) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/*/atleta/", "/*/cadastro", "/*/profissional", "/*/conta", "/*/painel", "/*/portal", "/*/admin", "/*/entrar"],
    },
  };
}
