import type { MetadataRoute } from "next";

/** Só a home é indexável. Áreas de atleta, cadastro e portal nunca devem ser indexadas. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/*/atleta/", "/*/cadastro", "/*/profissional", "/*/conta"],
    },
  };
}
