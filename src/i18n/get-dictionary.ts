import "server-only";
import type { Locale } from "./config";

const dictionaries = {
  pt: () => import("./dictionaries/pt").then((m) => m.default),
  es: () => import("./dictionaries/es").then((m) => m.default),
};

export const getDictionary = (locale: Locale) => dictionaries[locale]();
export type { Dictionary } from "./dictionaries/pt";

const panelDictionaries = {
  pt: () => import("./dictionaries/panel-pt").then((m) => m.default),
  es: () => import("./dictionaries/panel-es").then((m) => m.default),
};

/** Textos da área autenticada (separados para não pesar nas páginas públicas). */
export const getPanelDictionary = (locale: Locale) => panelDictionaries[locale]();
export type { PanelDictionary } from "./dictionaries/panel-pt";
