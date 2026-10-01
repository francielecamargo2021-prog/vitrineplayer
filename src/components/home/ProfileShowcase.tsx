import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { media } from "@/content/media";
import { demoAthlete as a } from "@/mocks/athletes";
import { Button } from "@/components/ui/Button";
import { MediaSlot } from "./MediaSlot";

/**
 * Perfil integrado à direção de arte: o atleta ocupa a tela (foto sangrando à
 * esquerda), o nome gigante invade a coluna de dados, a ficha é tipográfica.
 */
export function ProfileShowcase({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const { profile } = dict;
  const l = profile.labels;
  const rows: [string, string][] = [
    [l.year, String(a.year)],
    [l.position, a.position],
    [l.foot, a.foot],
    [l.height, a.height],
    [l.club, `${a.club}, ${a.category}`],
    [l.location, `${a.city}, ${a.country}`],
    [l.videos, `${a.videos.length} no YouTube`],
    [l.seeking, a.seeking.join(", ")],
  ];

  return (
    <section id="perfil" className="relative bg-ink lg:grid lg:min-h-[100svh] lg:grid-cols-12">
      {/* Foto do atleta */}
      <div data-reveal="frame" className="relative aspect-[4/5] overflow-hidden lg:col-span-7 lg:aspect-auto">
        <div className="frame-media absolute inset-0">
          <MediaSlot slot={media.athlete} sizes="(min-width: 1024px) 58vw, 100vw" labelPosition="top" className="[&>span]:top-14 md:[&>span]:top-16" />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(5,8,6,0.85),transparent_45%)] lg:bg-[linear-gradient(to_right,transparent_55%,rgba(5,8,6,0.9))]" />
        <p className="absolute right-4 top-4 bg-ink/70 px-3 py-1.5 text-[0.75rem] text-fog backdrop-blur md:right-6 md:top-6">{profile.demo}</p>
        <div className="absolute inset-x-0 bottom-0 p-4 md:p-8 lg:hidden">
          <p className="text-sm text-fog">{a.position}, {a.year}</p>
          <h3 className="display mt-2 text-[clamp(4rem,22vw,8rem)] leading-[0.82]">
            {a.sportName.split(" ").map((w) => <span key={w} className="block">{w}</span>)}
          </h3>
        </div>
      </div>

      {/* Ficha */}
      <div className="gutter relative flex flex-col justify-center py-14 lg:col-span-5 lg:py-24 lg:pl-0">
        <div className="hidden lg:block lg:-ml-[42%]">
          <p className="text-sm text-fog">{a.position}, {a.year}</p>
          <h3 data-reveal="lines" className="display mt-3 text-[clamp(6rem,10vw,11rem)] leading-[0.8]">
            {a.sportName.split(" ").map((w, i) => (
              <span key={w} className="line-mask" style={{ "--d": i * 140 } as CSSProperties}><span>{w}</span></span>
            ))}
          </h3>
        </div>

        <h2 className="display text-[clamp(2.2rem,10vw,3.4rem)] leading-[0.9] lg:mt-12">{profile.title}</h2>
        <dl className="mt-8 grid grid-cols-2 gap-x-6">
          {rows.map(([k, v]) => (
            <div key={k} className="border-t border-white/15 py-3.5">
              <dt className="text-[0.78rem] text-ash">{k}</dt>
              <dd className="mt-1 text-[1rem] font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <Button href={`/${lang}/atleta/exemplo`} variant="ghost" className="mt-8 self-start">{profile.open}</Button>
      </div>
    </section>
  );
}
