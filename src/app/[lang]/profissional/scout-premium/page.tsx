import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { privateMetadata } from "@/lib/seo";
import { MockShell } from "@/components/home/MockShell";
import { scoutPremium, type PremiumItem } from "@/content/scout-premium";

export const metadata = privateMetadata;

/** Prévia do Scout Premium: demonstração, sem preço, sem cobrança, sem dados reais. */
export default async function ScoutPremiumPreview({ params }: PageProps<"/[lang]/profissional/scout-premium">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const c = scoutPremium[lang];
  return (
    <MockShell lang={lang} dict={dict}>
      <main className="gutter mx-auto max-w-5xl space-y-16 py-10 md:py-16">
        <header className="space-y-5">
          <span className="inline-block border border-grass px-3 py-1 font-mono text-[0.75rem] uppercase tracking-[0.08em] text-grass" data-testid="premium-selo">{c.badge}</span>
          <h1 className="font-display text-[clamp(2.8rem,11vw,5.5rem)] font-black uppercase leading-[0.84] [font-stretch:62%]">{c.title}</h1>
          <p className="max-w-[62ch] text-[1.05rem] leading-relaxed text-fog">{c.lead}</p>
          <p role="note" className="max-w-[70ch] border-l-2 border-[#e2a64a] pl-4 text-[0.92rem] leading-relaxed text-bone" data-testid="premium-aviso">{c.disclaimer}</p>
        </header>

        <section className="space-y-6">
          <h2 className="font-display text-[1.9rem] font-extrabold uppercase leading-none [font-stretch:62%]">{c.basicTitle}</h2>
          <Items items={c.basicItems} c={c} />
          <Link href={`/${lang}/atleta/exemplo`} className="inline-block text-[0.92rem] text-bone underline underline-offset-4 hover:text-grass">{c.basicLink}</Link>
        </section>

        <section className="space-y-6">
          <h2 className="font-display text-[1.9rem] font-extrabold uppercase leading-none [font-stretch:62%]">{c.premiumTitle}</h2>
          <Items items={c.premiumItems} c={c} />
        </section>

        <section className="space-y-5" data-testid="premium-comparacao">
          <h2 className="font-display text-[1.9rem] font-extrabold uppercase leading-none [font-stretch:62%]">{c.compareTitle}</h2>
          <p className="max-w-[64ch] text-[0.92rem] text-fog">{c.compareLead}</p>
          <div className="overflow-x-auto border border-white/12">
            <table className="w-full min-w-[520px] text-[0.9rem]">
              <caption className="border-b border-white/12 px-4 py-2 text-left font-mono text-[0.75rem] uppercase tracking-[0.06em] text-[#e2a64a]">{c.compareFictional}</caption>
              <thead>
                <tr className="text-left text-[0.78rem] text-ash">
                  <th className="px-4 py-2 font-normal" />
                  {c.compareCols.map((h) => <th key={h} className="px-4 py-2 font-normal">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {c.compareRows.map((r) => (
                  <tr key={r.label} className="border-t border-white/12">
                    <td className="px-4 py-3 text-bone">{r.label}</td>
                    {[r.a, r.b].map((v, i) => (
                      <td key={i} className="px-4 py-3">
                        {v === null ? <span className="text-ash">—</span> : (
                          <span className="flex items-center gap-3" aria-label={`${v} de 5`}>
                            <span aria-hidden className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={`h-2 w-4 ${n <= v ? "bg-bone" : "bg-white/12"}`} />)}</span>
                            <span className="font-display text-[1.1rem] font-black [font-stretch:62%]">{v}</span>
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[0.82rem] text-ash">{c.compareNote}</p>
        </section>

        <section className="grid gap-10 md:grid-cols-2">
          <div className="space-y-4">
            <h2 className="font-display text-[1.6rem] font-extrabold uppercase leading-none [font-stretch:62%]">{c.neverTitle}</h2>
            <ul className="space-y-2.5">
              {c.neverItems.map((x) => <li key={x} className="flex gap-3 leading-snug text-fog"><span aria-hidden className="mt-2 h-px w-3 shrink-0 bg-grass" />{x}</li>)}
            </ul>
          </div>
          <div className="space-y-4">
            <h2 className="font-display text-[1.6rem] font-extrabold uppercase leading-none [font-stretch:62%]">{c.pricingTitle}</h2>
            <p className="leading-relaxed text-fog" data-testid="premium-preco">{c.pricingBody}</p>
          </div>
        </section>
      </main>
    </MockShell>
  );
}

function Items({ items, c }: { items: PremiumItem[]; c: (typeof scoutPremium)["pt"] }) {
  return (
    <ul className="grid gap-px border-y border-white/12 bg-white/12 md:grid-cols-2">
      {items.map((it) => (
        <li key={it.title} className="space-y-2 bg-ink py-5 md:px-5" data-status={it.status}>
          <span className={`inline-block px-2 py-0.5 font-mono text-[0.7rem] uppercase tracking-[0.06em] ${it.status === "ready" ? "bg-grass text-ink" : "border border-white/25 text-ash"}`}>{c.statusLabel[it.status]}</span>
          <h3 className="text-[1.05rem] font-semibold text-bone">{it.title}</h3>
          <p className="text-[0.9rem] leading-relaxed text-fog">{it.body}</p>
          {it.needs && <p className="text-[0.8rem] text-ash">{c.needsLabel}: {it.needs}</p>}
        </li>
      ))}
    </ul>
  );
}
