import type { CSSProperties } from "react";
import type { Dictionary } from "@/i18n/get-dictionary";
import { demoAthlete as a } from "@/mocks/athletes";
import { AthletePortrait } from "./AthletePortrait";

/**
 * Ficha do atleta. `teaser` = versão de vitrine na Home; `full` = mockup completo.
 * Nenhum dado de contato é exibido em nenhuma variante.
 */
export function AthleteProfile({ dict, variant = "teaser" }: { dict: Dictionary; variant?: "teaser" | "full" }) {
  const l = dict.profile.labels;
  const full = variant === "full";

  return (
    <article className="grid gap-px overflow-hidden border border-white/10 bg-white/10 lg:grid-cols-12">
      {/* Retrato */}
      <div className="relative bg-ink lg:col-span-5">
        <div data-tilt className="depth h-full">
          <AthletePortrait number={a.number} className="aspect-[4/5] h-full w-full lg:aspect-auto lg:min-h-[44rem]" priority={full} />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-6 md:p-8">
          <p className="eyebrow text-signal">{a.position} · {a.year}</p>
          <h3 className="display mt-3 text-[clamp(2.6rem,6vw,4.6rem)]">
            {a.sportName.split(" ").map((w) => (
              <span key={w} className="block">{w}</span>
            ))}
          </h3>
          {full && <p className="mt-3 font-mono text-xs uppercase tracking-[0.16em] text-fog">{a.fullName}</p>}
        </div>
        <span className="eyebrow absolute left-6 top-6 border border-white/15 bg-ink/60 px-2.5 py-1.5 backdrop-blur md:left-8 md:top-8">
          {dict.profile.demo}
        </span>
      </div>

      {/* Ficha técnica */}
      <div className="flex flex-col bg-graphite lg:col-span-7">
        <dl className="grid grid-cols-2 gap-px bg-white/[0.07] md:grid-cols-3">
          <Stat label={l.year} value={String(a.year)} />
          <Stat label={l.position} value={a.position} />
          <Stat label={l.foot} value={a.foot} />
          <Stat label={l.height} value={a.height} />
          <Stat label={l.location} value={`${a.city} · ${a.country}`} />
          <Stat label={l.club} value={`${a.club} · ${a.category}`} />
          {full && (
            <>
              <Stat label={l.secondary} value={a.secondary} />
              <Stat label={l.weight} value={a.weight} />
              <Stat label={l.nationality} value={a.nationality} />
              <Stat label={l.federated} value={a.federated ? l.yes : l.no} />
            </>
          )}
        </dl>

        <div className="grid flex-1 gap-px bg-white/[0.07] md:grid-cols-2">
          <Block title={l.previous}>
            <ul className="space-y-3">
              {a.previous.map((c) => (
                <li key={c.club} className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-3 last:border-0">
                  <span>{c.club}</span>
                  <span className="font-mono text-xs text-ash">{c.period}</span>
                </li>
              ))}
            </ul>
          </Block>

          <Block title={l.traits}>
            <ul className="flex flex-wrap gap-2">
              {a.traits.map((t) => (
                <li key={t} className="border border-white/15 px-3 py-1.5 text-sm text-fog transition-colors hover:border-signal hover:text-bone">
                  {t}
                </li>
              ))}
            </ul>
          </Block>

          <Block title={l.videos} className="md:col-span-2">
            <ul className="grid gap-3 sm:grid-cols-3">
              {a.videos.map((v, i) => (
                <li key={v.title} className="group relative aspect-video overflow-hidden bg-ink">
                  <div
                    className="absolute inset-0 transition-transform duration-1000 ease-[var(--ease-cine)] group-hover:scale-105"
                    style={{ background: `linear-gradient(${120 + i * 40}deg, #15171a, #0b0b0d 55%, hsl(${18 + i * 12} 60% 30% / 0.5))` } as CSSProperties}
                  />
                  <span className="absolute left-1/2 top-1/2 grid size-10 -translate-1/2 place-items-center rounded-full border border-white/40 bg-ink/40 backdrop-blur transition-all duration-500 group-hover:scale-110 group-hover:border-signal group-hover:bg-signal">
                    <svg viewBox="0 0 10 10" className="ml-0.5 size-3 fill-bone"><path d="M2 1l7 4-7 4z" /></svg>
                  </span>
                  <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-ink/90 p-2.5 text-[0.7rem] leading-tight">
                    <span className="line-clamp-2">{v.title}</span>
                    <span className="font-mono text-ash">{v.duration}</span>
                  </span>
                  <span className="absolute right-2 top-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-white/50">YouTube</span>
                </li>
              ))}
            </ul>
          </Block>

          <Block title={l.achievements}>
            <ul className="space-y-2 text-fog">
              {a.achievements.map((t) => (
                <li key={t} className="flex gap-3"><span className="mt-2 size-1.5 shrink-0 bg-signal" />{t}</li>
              ))}
            </ul>
          </Block>

          <Block title={l.goals}>
            <p className="leading-relaxed text-fog">{a.goals}</p>
            <p className="eyebrow mt-5">{l.seeking}</p>
            <p className="mt-2 text-sm">{a.seeking.join(" · ")}</p>
          </Block>

          {full && (
            <Block title={l.competitions} className="md:col-span-2">
              <p className="text-fog">{a.competitions.join(" · ")}</p>
            </Block>
          )}
        </div>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-graphite p-5 md:p-6">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-2.5 text-[0.95rem] font-medium md:text-base">{value}</dd>
    </div>
  );
}

function Block({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-graphite p-5 md:p-7 ${className}`}>
      <h4 className="eyebrow mb-5">{title}</h4>
      {children}
    </section>
  );
}
