import type { PanelDictionary } from "@/i18n/get-dictionary";
import { ageOn, categoryFor, youtubeThumb, type AthleteBundle } from "@/domain/athlete";
import { FramedPhoto } from "./FramedPhoto";
import { SectionTitle } from "./controls";

/**
 * Ficha do atleta em linguagem de scouting: foto grande sangrando, nome gigante
 * invadindo a coluna de dados, seções separadas por filetes. Nenhum dado de
 * contato do responsável é recebido por este componente.
 */
export function AthleteSheet({ bundle, urls, p, locale, actions }: { bundle: AthleteBundle; urls: Record<string, string>; p: PanelDictionary; locale: string; actions?: React.ReactNode }) {
  const { athlete: a, photos, videos, clubs, achievements } = bundle;
  const s = p.sheet;
  const f = p.fields;
  const primary = photos.find((ph) => ph.is_primary);
  const gallery = photos.filter((ph) => ph.storage_path && urls[ph.storage_path]);
  const region = new Intl.DisplayNames([locale], { type: "region" });
  const fmtMonth = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });
  const month = (d: string | null) => (d ? fmtMonth.format(new Date(`${d}T12:00:00`)) : "");
  const name = (a.sport_name || a.full_name).split(" ");
  const empty = <span className="text-ash">{s.empty}</span>;

  const facts: [string, React.ReactNode][] = [
    [f.age, `${ageOn(a.birth_date)}`],
    [f.category, a.category ?? categoryFor(a.birth_date)],
    [f.primaryPosition, a.primary_position ? p.positions[a.primary_position] : empty],
    [f.currentClub, a.current_club ?? empty],
    [f.city, [a.city, a.state, region.of(a.country)].filter(Boolean).join(", ")],
    [f.height, a.height_cm ? `${a.height_cm} cm` : empty],
    [f.weight, a.weight_kg ? `${a.weight_kg} kg` : empty],
    [f.foot, a.foot ? f.feet[a.foot] : empty],
    [f.nationality, a.nationality ? region.of(a.nationality) : empty],
    [f.otherCitizenship, a.other_citizenships.length ? a.other_citizenships.map((c) => region.of(c)).join(", ") : "—"],
    [f.passport, a.valid_passport === null ? empty : a.valid_passport ? p.form.yes : p.form.no],
  ];
  const availability: [string, string | null][] = [
    [f.available, a.available === null ? null : a.available ? p.form.yes : p.form.no],
    [f.travel, a.travel ? f.travelAnswers[a.travel] : null],
    [f.relocateCity, a.relocate_city ? f.answers[a.relocate_city] : null],
    [f.relocateState, a.relocate_state ? f.answers[a.relocate_state] : null],
    [f.relocateAbroad, a.relocate_abroad ? f.answers[a.relocate_abroad] : null],
  ];

  return (
    <article>
      {/* Abertura */}
      <header className="relative grid lg:min-h-[calc(100svh-4rem)] lg:grid-cols-12 lg:grid-rows-[1fr]">
        <FramedPhoto
          src={primary?.storage_path ? urls[primary.storage_path] : null} x={primary?.focal_x} y={primary?.focal_y} zoom={primary?.zoom} eager
          className="aspect-[4/5] max-h-[78svh] w-full lg:col-span-6 lg:aspect-auto lg:h-full lg:max-h-none"
        />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 aspect-[4/5] max-h-[78svh] bg-[linear-gradient(to_top,#050806,rgba(5,8,6,0)_45%)] lg:hidden" />
        <div className="gutter relative z-10 -mt-24 flex flex-col lg:col-span-6 lg:mt-0 lg:justify-end lg:pb-14 lg:pl-12 lg:pr-10">
          <p className="eyebrow text-grass">
            {[a.primary_position && p.positions[a.primary_position], a.category ?? categoryFor(a.birth_date)].filter(Boolean).join(" · ")}
          </p>
          <h1 className="mt-3 font-display text-[clamp(3.4rem,17vw,9.5rem)] font-black uppercase leading-[0.8] [font-stretch:62%] lg:-ml-[30%]">
            {name.map((w, i) => (
              <span key={`${w}${i}`} className={`block ${i === name.length - 1 && name.length > 1 ? "text-transparent [-webkit-text-stroke:0.016em_#efeee8]" : "text-[#e6e5de]"}`}>{w}</span>
            ))}
          </h1>
          <dl className="mt-10 grid grid-cols-2 gap-x-6 border-t border-white/12 sm:grid-cols-4">
            {facts.map(([k, v]) => (
              <div key={k} className="border-b border-white/[0.08] py-4">
                <dt className="text-[0.75rem] text-ash">{k}</dt>
                <dd className="mt-1 text-[1.02rem] text-bone">{v}</dd>
              </div>
            ))}
          </dl>
          {actions && <div className="mt-8">{actions}</div>}
          <p className="mt-6 text-[0.8rem] text-ash">{s.privateNote}</p>
        </div>
      </header>

      <div className="gutter mx-auto max-w-7xl space-y-16 py-20">
        <Section title={s.about}>
          {a.bio ? <p className="max-w-[68ch] text-[1.1rem] leading-relaxed text-fog">{a.bio}</p> : empty}
          {a.experiences && <p className="mt-6 max-w-[68ch] leading-relaxed text-ash">{a.experiences}</p>}
        </Section>

        <Section title={s.career}>
          <ul className="divide-y divide-white/10 border-y border-white/10">
            {a.current_club && (
              <li className="flex items-baseline justify-between gap-4 py-4">
                <span className="text-bone">{a.current_club} <span className="text-[0.8rem] text-grass">· {s.current}</span></span>
                <span className="text-[0.85rem] text-ash">{a.current_club_since ? `${s.since} ${month(a.current_club_since)}` : ""}</span>
              </li>
            )}
            {clubs.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-4 py-4">
                <span className="text-fog">{c.club}</span>
                <span className="text-[0.85rem] text-ash">{[month(c.started_on), month(c.ended_on)].filter(Boolean).join(" — ")}</span>
              </li>
            ))}
          </ul>
          {(a.federated || a.competitions.length > 0) && (
            <p className="mt-6 text-[0.95rem] text-fog">
              {a.federated && <>{f.federated}{a.federation ? ` · ${a.federation}` : ""}<br /></>}
              {a.competitions.length > 0 && <span className="text-ash">{s.competitions}: {a.competitions.join(" · ")}</span>}
            </p>
          )}
        </Section>

        <Section title={s.traits} aside={<span className="text-[0.8rem] text-ash">{s.selfDeclared}</span>}>
          {a.traits.length ? (
            <ul className="flex flex-wrap gap-2">
              {a.traits.map((t) => (
                <li key={t} className="border border-white/15 px-4 py-2 text-fog">{p.traits[t as keyof typeof p.traits] ?? t}</li>
              ))}
            </ul>
          ) : empty}
        </Section>

        <Section title={s.achievements}>
          {achievements.length ? (
            <ul className="divide-y divide-white/10 border-y border-white/10">
              {achievements.map((x) => (
                <li key={x.id} className="flex items-baseline justify-between gap-4 py-4">
                  <span className="text-bone">{x.title}{x.competition && <span className="text-ash"> · {x.competition}</span>}</span>
                  <span className="font-display text-[1.3rem] font-extrabold [font-stretch:62%]">{x.year ?? ""}</span>
                </li>
              ))}
            </ul>
          ) : empty}
        </Section>

        <Section title={s.videos}>
          {videos.length ? (
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {videos.map((v) => (
                <li key={v.id}>
                  <a href={v.url!} target="_blank" rel="noopener noreferrer" className="group relative block aspect-video overflow-hidden bg-pitch">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={youtubeThumb(v.external_id!)} alt="" loading="lazy" className="size-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    <span className="absolute inset-0 grid place-items-center">
                      <span className="grid size-14 place-items-center border border-white/60 bg-ink/40 backdrop-blur-sm transition-colors group-hover:bg-grass">
                        <svg viewBox="0 0 10 10" className="ml-0.5 size-3.5 fill-bone" aria-hidden><path d="M2 1l7 4-7 4z" /></svg>
                      </span>
                    </span>
                  </a>
                  <p className="mt-2 text-bone">{v.title || "YouTube"}</p>
                  <p className="text-[0.8rem] text-ash">{p.videos.types[v.video_type ?? "other"]}</p>
                </li>
              ))}
            </ul>
          ) : empty}
        </Section>

        {gallery.length > 0 && (
          <Section title={s.gallery}>
            <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {gallery.map((ph, i) => (
                <li key={ph.id} className={i === 0 ? "col-span-2 row-span-2" : ""}>
                  <FramedPhoto src={urls[ph.storage_path!]} x={ph.focal_x} y={ph.focal_y} zoom={ph.zoom} className="aspect-square size-full" />
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title={s.availability}>
          <dl className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {availability.map(([k, v]) => (
              <div key={k} className="border-b border-white/[0.08] py-4">
                <dt className="text-[0.75rem] text-ash">{k}</dt>
                <dd className="mt-1 text-bone">{v ?? empty}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title={s.goals}>
          {a.seeking.length ? (
            <ul className="flex flex-wrap gap-2">
              {a.seeking.map((k) => <li key={k} className="border border-grass/50 px-4 py-2 text-bone">{p.seeking[k]}</li>)}
            </ul>
          ) : empty}
          {a.goals && <p className="mt-6 max-w-[68ch] leading-relaxed text-fog">{a.goals}</p>}
        </Section>
      </div>
    </article>
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-3">
        <SectionTitle>{title}</SectionTitle>
        {aside && <div className="mt-2">{aside}</div>}
      </div>
      <div className="lg:col-span-9 lg:border-t lg:border-white/12 lg:pt-5">{children}</div>
    </section>
  );
}
