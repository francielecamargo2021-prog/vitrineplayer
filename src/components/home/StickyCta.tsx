import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";

/** Barra de conversão fixa no celular (tráfego pago). Aparece após o hero. */
export function StickyCta({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  return (
    <div className="sticky-cta fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <p className="eyebrow truncate text-bone">{dict.sticky.label}</p>
          <p className="mt-1 truncate text-xs text-fog">{dict.sticky.price}</p>
        </div>
        <Link
          href={`/${lang}/cadastro`}
          className="flex h-12 shrink-0 items-center bg-bone px-5 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-ink active:bg-signal"
        >
          {dict.sticky.cta}
        </Link>
      </div>
    </div>
  );
}
