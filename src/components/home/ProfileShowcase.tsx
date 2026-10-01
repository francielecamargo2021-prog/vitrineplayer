import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { demoAthlete as a } from "@/mocks/athletes";
import { SectionIndex } from "@/components/ui/SectionIndex";
import { Button } from "@/components/ui/Button";
import { AthletePortrait } from "@/components/athlete/AthletePortrait";

/**
 * Perfil em composição editorial: retrato grande com nome oversized e uma
 * ficha técnica em linhas (sem caixas). A ficha completa fica no mockup.
 */
export function ProfileShowcase({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const { profile } = dict;
  const l = profile.labels;
  const rows: [string, string][] = [
    [l.year, String(a.year)],
    [l.position, `${a.position} / ${a.secondary}`],
    [l.foot, a.foot],
    [l.height, a.height],
    [l.location, `${a.city} · ${a.country}`],
    [l.club, `${a.club} · ${a.category}`],
    [l.previous, a.previous.map((c) => c.club).join(" · ")],
    [l.videos, `${a.videos.length} · YouTube`],
    [l.achievements, a.achievements[0]],
    [l.goals, a.seeking.join(" · ")],
  ];

  return (
    <section id="perfil" className="relative py-28 md:py-44">
      <div className="gutter">
        <SectionIndex>{profile.index}</SectionIndex>
        <h2 data-reveal className="display mt-10 max-w-[13ch] text-[clamp(2.2rem,9vw,6rem)] [font-stretch:100%] md:[font-stretch:125%]">
          {profile.title}
        </h2>
      </div>

      <div className="mt-14 grid md:mt-24 lg:grid-cols-12 lg:gap-12 lg:px-16">
        {/* Retrato — sangra nas bordas no celular */}
        <div data-reveal="frame" className="relative overflow-hidden lg:col-span-7">
          <div className="frame-media">
            <div data-tilt className="depth">
              <AthletePortrait number={a.number} className="aspect-[4/5] w-full lg:aspect-[5/6]" />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5 md:p-10">
            <p className="eyebrow text-fog">{a.position} · {a.year}</p>
            <h3 className="display mt-3 text-[clamp(3.2rem,15vw,8rem)] leading-[0.82] [font-stretch:100%] lg:text-[5vw] md:[font-stretch:125%]">
              {a.sportName.split(" ").map((w) => (
                <span key={w} className="block">{w}</span>
              ))}
            </h3>
          </div>
          <span className="eyebrow absolute left-5 top-5 bg-ink/60 px-2.5 py-1.5 backdrop-blur md:left-10 md:top-10">
            {profile.demo}
          </span>
        </div>

        {/* Ficha técnica */}
        <div className="gutter mt-12 lg:col-span-5 lg:mt-0 lg:px-0">
          <dl className="lg:sticky lg:top-28">
            {rows.map(([k, v], i) => (
              <div
                key={k}
                data-reveal
                style={{ "--d": i * 60 } as CSSProperties}
                className="grid grid-cols-[7.5rem_1fr] gap-4 border-t border-white/12 py-4 md:grid-cols-[9rem_1fr]"
              >
                <dt className="eyebrow pt-1">{k}</dt>
                <dd className="text-[0.98rem]">{v}</dd>
              </div>
            ))}
            <div className="border-t border-white/12 pt-6">
              <p className="eyebrow">{l.traits}</p>
              <p className="mt-3 text-fog">{a.traits.join("  ·  ")}</p>
              <Button href={`/${lang}/atleta/exemplo`} variant="line" className="mt-8">{profile.open}</Button>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
