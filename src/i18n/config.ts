export const locales = ["pt", "es"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "pt";

/** Atributo `lang` do <html> e formatação (Intl) por locale de rota. */
export const htmlLang: Record<Locale, string> = { pt: "pt-BR", es: "es" };

export const hasLocale = (value: string): value is Locale =>
  (locales as readonly string[]).includes(value);
