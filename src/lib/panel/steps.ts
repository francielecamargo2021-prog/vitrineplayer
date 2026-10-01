/** Etapas do perfil (slug estável na URL; rótulos nos dicionários). */
export const stepSlugs = ["dados", "fotos", "fisico", "futebol", "perfil", "disponibilidade", "videos", "privacidade", "publicacao"] as const;
export type StepSlug = (typeof stepSlugs)[number];
export const isStep = (v: string): v is StepSlug => (stepSlugs as readonly string[]).includes(v);
