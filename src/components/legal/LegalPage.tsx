import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Footer } from "@/components/home/Footer";
import { LangSwitch } from "@/components/home/LangSwitch";
import { LEGAL_INFO, LEGAL_STATUS, LEGAL_VERSION, legalDocs, legalUi, type LegalKind } from "@/content/legal";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";

const ROUTES: Record<LegalKind, string> = { privacy: "privacidade", terms: "termos", contact: "contato" };
export const legalHref = (lang: Locale, kind: LegalKind) => `/${lang}/${ROUTES[kind]}`;

/** Troca {marca} pelo dado da empresa e destaca o que ainda está "[a definir]". */
function Text({ s, missing }: { s: string; missing: string }) {
  const parts = s.split(/(\{[a-z_]+\}|\[[^\]]+\])/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        const key = /^\{([a-z_]+)\}$/.exec(p)?.[1] as keyof typeof LEGAL_INFO | undefined;
        if (key) {
          const v = LEGAL_INFO[key];
          if (v && key === "email") return <a key={i} href={`mailto:${v}`} className="text-bone underline underline-offset-4">{v}</a>;
          if (v) return <span key={i}>{v}</span>;
          return <span key={i} data-pending className="bg-white/[0.08] px-1.5 text-bone">[{missing}]</span>;
        }
        if (p.startsWith("[")) return <span key={i} data-pending className="bg-white/[0.08] px-1.5 text-bone">{p}</span>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export function LegalPage({ lang, kind, dict }: { lang: Locale; kind: LegalKind; dict: Dictionary }) {
  const doc = legalDocs[kind][lang];
  const ui = legalUi[lang];
  const kinds = Object.keys(ROUTES) as LegalKind[];
  return (
    <div className="min-h-svh bg-ink">
      <header className="gutter sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/[0.08] bg-ink/85 backdrop-blur-xl">
        <Link href={`/${lang}`} aria-label={ui.back} className="text-bone"><Logo variant="editorial" /></Link>
        <LangSwitch current={lang} label={dict.nav.langLabel} />
      </header>

      <main className="gutter mx-auto max-w-7xl pb-24 pt-12 md:pt-20">
        <nav aria-label={ui.contents} className="flex flex-wrap gap-x-6 gap-y-2 text-[0.9rem]">
          {kinds.map((k) => (
            <Link key={k} href={legalHref(lang, k)} aria-current={k === kind ? "page" : undefined}
              className={k === kind ? "text-bone underline decoration-grass decoration-2 underline-offset-[6px]" : "text-fog transition-colors hover:text-bone"}>
              {ui.nav[k]}
            </Link>
          ))}
        </nav>

        <h1 className="mt-10 font-display text-[clamp(3rem,15vw,8.5rem)] font-black uppercase leading-[0.84] [font-stretch:62%]">
          <span className="block text-[#e6e5de]">{doc.title[0]}</span>
          <span className="block text-transparent [-webkit-text-stroke:0.02em_#efeee8]">{doc.title[1]}</span>
        </h1>
        <p className="mt-6 max-w-[56ch] text-lg leading-relaxed text-fog">{doc.lead}</p>

        {LEGAL_STATUS === "draft" && (
          <aside role="note" data-testid="legal-draft" className="mt-10 max-w-3xl border-l-2 border-grass bg-pitch px-5 py-4">
            <p className="font-medium text-bone">{ui.draftTitle}</p>
            <p className="mt-1 text-[0.95rem] leading-relaxed text-fog">{ui.draftBody}</p>
          </aside>
        )}
        <p className="mt-6 text-[0.85rem] text-ash">{ui.version}: {LEGAL_VERSION}</p>

        <div className="mt-14 grid gap-12 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
          {doc.sections.length > 4 && (
            <nav aria-label={ui.contents} className="border-t border-white/10 pt-5 lg:sticky lg:top-24 lg:self-start">
              <p className="eyebrow text-bone">{ui.contents}</p>
              <ol className="mt-4 space-y-2 text-[0.9rem]">
                {doc.sections.map((s) => (
                  <li key={s.id}><a href={`#${s.id}`} className="text-fog transition-colors hover:text-bone">{s.title}</a></li>
                ))}
              </ol>
            </nav>
          )}
          <div className={`max-w-[72ch] ${doc.sections.length > 4 ? "" : "lg:col-span-2"}`}>
            {doc.sections.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-24 border-t border-white/10 py-10 first:pt-6">
                <h2 className="font-display text-[clamp(1.9rem,6vw,2.8rem)] font-black uppercase leading-[0.9] [font-stretch:68%] text-bone">{s.title}</h2>
                {s.body?.map((p, i) => (
                  <p key={i} className="mt-5 text-[1.02rem] leading-relaxed text-fog"><Text s={p} missing={ui.placeholder} /></p>
                ))}
                {s.list && (
                  <ul className="mt-5 space-y-3">
                    {s.list.map((li, i) => (
                      <li key={i} className="relative pl-5 text-[1.02rem] leading-relaxed text-fog before:absolute before:left-0 before:top-[0.7em] before:h-px before:w-2.5 before:bg-grass">
                        <Text s={li} missing={ui.placeholder} />
                      </li>
                    ))}
                  </ul>
                )}
                {s.table && (
                  <dl className="mt-6 divide-y divide-white/10 border-y border-white/10">
                    <div className="hidden gap-6 py-3 text-[0.8rem] uppercase tracking-wide text-ash md:grid md:grid-cols-[14rem_1fr]">
                      <dt>{s.table.head[0]}</dt><dd>{s.table.head[1]}</dd>
                    </div>
                    {s.table.rows.map(([a, b]) => (
                      <div key={a} className="grid gap-1 py-4 md:grid-cols-[14rem_1fr] md:gap-6">
                        <dt className="font-medium text-bone">{a}</dt>
                        <dd className="leading-relaxed text-fog"><Text s={b} missing={ui.placeholder} /></dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            ))}
          </div>
        </div>
      </main>
      <Footer lang={lang} dict={dict} />
    </div>
  );
}
