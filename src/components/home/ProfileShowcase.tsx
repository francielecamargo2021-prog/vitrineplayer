import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { SectionIndex } from "@/components/ui/SectionIndex";
import { Button } from "@/components/ui/Button";
import { AthleteProfile } from "@/components/athlete/AthleteProfile";

export function ProfileShowcase({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const { profile } = dict;
  return (
    <section id="perfil" className="gutter relative py-28 md:py-40">
      <div className="flex flex-col justify-between gap-10 md:flex-row md:items-end">
        <div>
          <SectionIndex>{profile.index}</SectionIndex>
          <h2 data-reveal className="display mt-10 max-w-[13ch] text-[clamp(2.2rem,6vw,5.5rem)]">{profile.title}</h2>
        </div>
        <div data-reveal className="max-w-sm" style={{ "--d": 200 } as React.CSSProperties}>
          <p className="leading-relaxed text-fog">{profile.body}</p>
          <Button href={`/${lang}/atleta/exemplo`} variant="line" className="mt-6">{profile.open}</Button>
        </div>
      </div>
      <div data-reveal className="mt-14 md:mt-20">
        <AthleteProfile dict={dict} />
      </div>
    </section>
  );
}
