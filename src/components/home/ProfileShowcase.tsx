import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { demoAthlete as a } from "@/mocks/athletes";
import { Button } from "@/components/ui/Button";

/**
 * Seção C — Perfil do atleta como ficha técnica de scouting. Dados 100% fictícios
 * (mocks/athletes) e identificados como tal. Sem foto real: o espaço da foto é
 * tipográfico (número da camisa) e diz que é demonstrativo. Nenhum dado de contato.
 */
export function ProfileShowcase({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const { profile } = dict;
  const l = profile.labels;
  const k = dict.home.profile;
  const rows: [string, string][] = [
    [l.year, String(a.year)],
    [l.position, a.position],
    [l.foot, a.foot],
    [l.height, a.height],
    [l.club, `${a.club} · ${a.category}`],
    [l.location, `${a.city}, ${a.country}`],
  ];

  return (
    <section id="perfil" className="gutter relative bg-ink py-20 md:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <p className="t-kicker">{k.kicker}</p>
            <h2 data-reveal="lines" className="t-display t-h2 mt-5">
              <span className="line-mask"><span>{profile.title}</span></span>
            </h2>
          </div>
          <p className="t-body max-w-[44ch] md:col-span-5">{profile.body}</p>
        </div>

        <article data-reveal="up" className="mt-12 grid grid-cols-1 overflow-hidden border border-white/12 bg-night md:mt-16 lg:grid-cols-12">
          {/* Espaço da foto: tipográfico e honesto */}
          <div className="relative min-h-[300px] overflow-hidden bg-pitch lg:col-span-5 lg:min-h-[560px]">
            <div aria-hidden className="pitch-lines absolute inset-0" />
            <span aria-hidden className="pitch-circle absolute left-1/2 top-1/2 size-[62%] -translate-x-1/2 -translate-y-1/2" />
            <span aria-hidden className="t-display absolute inset-0 flex items-center justify-center text-[clamp(10rem,28vw,20rem)] leading-none text-white/[0.07]">{a.number}</span>
            <p className="absolute left-4 top-4 bg-ink/75 px-3 py-1.5 text-[0.75rem] text-bone/85 backdrop-blur md:left-6 md:top-6">{profile.demo}</p>
            <p className="absolute inset-x-4 bottom-4 text-[0.75rem] text-bone/55 md:inset-x-6 md:bottom-6">{k.photo} · {k.photoNote}</p>
          </div>

          {/* Ficha */}
          <div className="min-w-0 p-6 md:p-10 lg:col-span-7">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-white/12 pb-6">
              <div className="min-w-0">
                <p className="text-[0.85rem] text-bone/60">{a.position} · {a.year}</p>
                <h3 className="t-display mt-2 text-[clamp(2.6rem,6vw,4.5rem)] leading-[0.9]">{a.sportName}</h3>
              </div>
              <span className="t-display text-[2.4rem] leading-none text-grass">#{a.number}</span>
            </div>

            <p className="t-kicker mt-6 !text-bone/60">{k.sheet}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
              {rows.map(([key, v], i) => (
                <div key={key} data-reveal="up" style={{ "--d": 80 + i * 60 } as CSSProperties} className="min-w-0 border-t border-white/10 py-3.5">
                  <dt className="text-[0.75rem] text-bone/55">{key}</dt>
                  <dd className="mt-1 text-[0.98rem] font-medium">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2 [&>div]:min-w-0">
              <div>
                <p className="t-kicker !text-bone/60">{k.videos}</p>
                <ul className="mt-3">
                  {a.videos.map((v) => (
                    <li key={v.title} className="flex items-center justify-between gap-4 border-t border-white/10 py-3 text-[0.92rem]">
                      <span className="flex min-w-0 items-center gap-3">
                        <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0 text-grass"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
                        <span className="truncate">{v.title}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-bone/55">{v.duration}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="t-kicker !text-bone/60">{k.goal}</p>
                <p className="mt-3 border-t border-white/10 pt-3 text-[0.95rem] leading-relaxed text-bone/80">{a.goals}</p>
              </div>
            </div>

            <Button href={`/${lang}/atleta/exemplo`} variant="ghost" className="mt-10 w-full sm:w-auto">{profile.open}</Button>
          </div>
        </article>
      </div>
    </section>
  );
}
