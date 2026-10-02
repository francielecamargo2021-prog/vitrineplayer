import type { PanelDictionary } from "@/i18n/get-dictionary";
import { ageOn, categoryFor, youtubeThumb, type AthleteBundle } from "@/domain/athlete";
import { FramedPhoto } from "./FramedPhoto";

/**
 * Ficha do atleta: scouting + editorial esportivo. Abre com a foto em tela
 * cheia e alterna superfícies da identidade (off-white, verde profundo, grafite,
 * gramado). Nenhum dado de contato do responsável é recebido aqui.
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
  const year = (d: string | null) => (d ? d.slice(0, 4) : "");
  const words = (a.sport_name || a.full_name).split(" ");
  const last = words.length > 1 ? words.pop() : null;
  const category = a.category ?? categoryFor(a.birth_date);
  const position = a.primary_position ? p.positions[a.primary_position] : null;
  const nations = [a.nationality, ...a.other_citizenships].filter(Boolean).map((c) => region.of(c!)).join(" · ");
  const dash = <span className="opacity-40">—</span>;

  const big: [string, React.ReactNode, string?][] = [
    [f.age, ageOn(a.birth_date), s.years],
    [f.height, a.height_cm ?? dash, a.height_cm ? "cm" : undefined],
    [f.weight, a.weight_kg ?? dash, a.weight_kg ? "kg" : undefined],
    [f.foot, a.foot ? <span className="text-[0.6em]">{f.feet[a.foot]}</span> : dash],
  ];
  const details: [string, React.ReactNode][] = [
    [f.primaryPosition, position ?? dash],
    [f.secondaryPositions, a.secondary_positions.length ? a.secondary_positions.map((x) => p.positions[x]).join(", ") : dash],
    [f.category, category],
    [f.currentClub, a.current_club ? <>{a.current_club}{a.current_club_since && <span className="text-[#6b7a71]"> · {s.since} {month(a.current_club_since)}</span>}</> : dash],
    [f.federated, a.federated ? a.federation || p.form.yes : p.form.no],
    [f.nationality, a.nationality ? region.of(a.nationality) : dash],
    [f.otherCitizenship, a.other_citizenships.length ? a.other_citizenships.map((c) => region.of(c)).join(", ") : dash],
    [f.passport, a.valid_passport === null ? dash : a.valid_passport ? p.form.yes : p.form.no],
    [f.city, [a.city, a.state, region.of(a.country)].filter(Boolean).join(", ")],
  ];
  const availability: [string, string | null][] = [
    [f.available, a.available === null ? null : a.available ? p.form.yes : p.form.no],
    [f.travel, a.travel ? f.travelAnswers[a.travel] : null],
    [f.relocateCity, a.relocate_city ? f.answers[a.relocate_city] : null],
    [f.relocateState, a.relocate_state ? f.answers[a.relocate_state] : null],
    [f.relocateAbroad, a.relocate_abroad ? f.answers[a.relocate_abroad] : null],
  ];
  const [feature, ...moreVideos] = videos;

  return (
    <article>
      {/* Abertura: fotografia em tela cheia, nome em duas vozes (como o Hero) */}
      <header className="relative min-h-[560px] overflow-hidden bg-pitch h-[88svh] md:h-[calc(100svh-4rem)]">
        <div className="absolute inset-0">
          <FramedPhoto src={primary?.storage_path ? urls[primary.storage_path] : null} x={primary?.focal_x} y={primary?.focal_y} zoom={primary?.zoom} eager className="size-full" />
        </div>
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_top,rgba(5,8,6,0.92)_0%,rgba(5,8,6,0.45)_34%,rgba(5,8,6,0)_62%),linear-gradient(to_bottom,rgba(5,8,6,0.55),transparent_22%)] md:bg-[linear-gradient(to_top,rgba(5,8,6,0.85)_0%,rgba(5,8,6,0.2)_45%,rgba(5,8,6,0)_65%),linear-gradient(to_right,rgba(5,8,6,0.6)_0%,rgba(5,8,6,0)_55%)]" />
        <span className="gutter absolute left-0 top-5 text-[0.75rem] text-fog">
          <span className="border border-white/25 bg-ink/40 px-2.5 py-1.5 backdrop-blur">{s.privateBadge}</span>
        </span>
        <div className="gutter absolute inset-x-0 bottom-0 pb-8 md:pb-14">
          <p className="eyebrow text-signal-soft">{[position, category, a.current_club].filter(Boolean).join(" · ")}</p>
          <h1 className="mt-3 font-display text-[clamp(4rem,21vw,13rem)] font-black uppercase leading-[0.8] [font-stretch:62%] md:text-[clamp(5rem,12vw,13rem)]">
            <span className="block text-[#e6e5de]">{words.join(" ")}</span>
            {last && <span className="block text-transparent [-webkit-text-stroke:0.016em_#efeee8]">{last}</span>}
          </h1>
          <p className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-[0.95rem] text-fog">
            <span>{ageOn(a.birth_date)} {s.years}</span>
            {a.foot && <span>{f.feet[a.foot]}</span>}
            {a.height_cm && <span>{(a.height_cm / 100).toFixed(2).replace(".", ",")} m</span>}
            {nations && <span>{nations}</span>}
          </p>
        </div>
      </header>

      {/* Ficha técnica: off-white, leitura de scouting */}
      <section className="bg-bone text-ink">
        <div className="gutter mx-auto max-w-7xl py-12 md:py-16">
          <p className="eyebrow text-[#56645c]">{s.technical}</p>
          <dl className="mt-5 grid grid-cols-2 border-t border-ink/15 md:grid-cols-4">
            {big.map(([k, v, unit]) => (
              <div key={k} className="border-b border-ink/10 py-5 pr-4 md:border-b-0 md:border-r md:px-6 md:first:pl-0 md:last:border-r-0">
                <dt className="text-[0.78rem] text-[#56645c]">{k}</dt>
                <dd className="mt-1 font-display text-[clamp(2.6rem,10vw,4.2rem)] font-black uppercase leading-none [font-stretch:62%]">
                  {v}{unit && <span className="ml-1 text-[0.4em] font-extrabold text-turf">{unit}</span>}
                </dd>
              </div>
            ))}
          </dl>
          <dl className="mt-8 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {details.map(([k, v]) => (
              <div key={k} className="border-b border-ink/10 py-3.5">
                <dt className="text-[0.75rem] text-[#56645c]">{k}</dt>
                <dd className="mt-0.5 text-[1.02rem]">{v}</dd>
              </div>
            ))}
          </dl>
          {actions && <div className="mt-10">{actions}</div>}
        </div>
      </section>

      {/* Sobre + características: verde profundo */}
      <section className="bg-pitch">
        <div className="gutter mx-auto grid max-w-7xl gap-12 py-14 md:grid-cols-12 md:py-20">
          <div className="md:col-span-7">
            <SectionHead>{s.about}</SectionHead>
            {a.bio ? <p className="mt-6 max-w-[34ch] text-[clamp(1.3rem,4.6vw,1.75rem)] leading-[1.35] text-bone">{a.bio}</p> : <p className="mt-6 text-ash">{s.empty}</p>}
            {a.experiences && <p className="mt-6 max-w-[60ch] leading-relaxed text-fog">{a.experiences}</p>}
          </div>
          <div className="md:col-span-5">
            <SectionHead>{s.traits}</SectionHead>
            {a.traits.length ? (
              <ul className="mt-6 border-t border-white/15">
                {a.traits.map((t) => (
                  <li key={t} className="border-b border-white/10 py-3 font-display text-[1.6rem] font-extrabold uppercase leading-none [font-stretch:62%]">
                    {p.traits[t as keyof typeof p.traits] ?? t}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-6 text-ash">{s.empty}</p>}
            <p className="mt-4 text-[0.8rem] leading-snug text-ash">{s.selfDeclaredNote}</p>
          </div>
        </div>
      </section>

      {/* Vídeos: destaque + lista com miniaturas */}
      {feature && (
        <section className="bg-ink">
          <div className="gutter mx-auto max-w-7xl py-14 md:py-20">
            <SectionHead>{s.videos}</SectionHead>
            <div className="mt-8 grid gap-8 lg:grid-cols-12">
              <VideoCard v={feature} p={p} s={s} className="lg:col-span-8" big />
              {moreVideos.length > 0 && (
                <ul className="grid gap-6 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-1">
                  {moreVideos.map((v) => <li key={v.id}><VideoCard v={v} p={p} s={s} /></li>)}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Carreira e conquistas: grafite */}
      <section className="bg-graphite">
        <div className="gutter mx-auto grid max-w-7xl gap-12 py-14 md:grid-cols-12 md:py-20">
          <div className="md:col-span-7">
            <SectionHead>{s.career}</SectionHead>
            <ol className="mt-6 border-t border-white/12">
              {a.current_club && (
                <li className="grid grid-cols-[6.5rem_1fr] gap-4 border-b border-white/[0.08] py-4 md:grid-cols-[8rem_1fr]">
                  <span className="font-display text-[1.5rem] font-extrabold leading-none text-grass [font-stretch:62%]">{year(a.current_club_since) || "—"}</span>
                  <span className="text-[1.05rem] text-bone">{a.current_club} <span className="text-[0.8rem] text-signal-soft">· {s.current}</span></span>
                </li>
              )}
              {clubs.map((c) => (
                <li key={c.id} className="grid grid-cols-[6.5rem_1fr] gap-4 border-b border-white/[0.08] py-4 md:grid-cols-[8rem_1fr]">
                  <span className="font-display text-[1.3rem] font-extrabold leading-none text-fog [font-stretch:62%] md:text-[1.5rem]">{[year(c.started_on), year(c.ended_on)].filter(Boolean).join("–") || "—"}</span>
                  <span className="text-fog">{c.club}</span>
                </li>
              ))}
            </ol>
            {a.competitions.length > 0 && (
              <>
                <p className="eyebrow mt-8 text-ash">{s.competitions}</p>
                <p className="mt-2 text-fog">{a.competitions.join(" · ")}</p>
              </>
            )}
          </div>
          <div className="md:col-span-5">
            <SectionHead>{s.achievements}</SectionHead>
            {achievements.length ? (
              <ul className="mt-6 border-t border-white/12">
                {achievements.map((x) => (
                  <li key={x.id} className="flex items-start justify-between gap-4 border-b border-white/[0.08] py-4">
                    <span><span className="block text-[1.05rem] text-bone">{x.title}</span>{x.competition && <span className="text-[0.85rem] text-ash">{x.competition}</span>}</span>
                    <span className="font-display text-[2rem] font-black leading-none text-[#e6e5de] [font-stretch:62%]">{x.year ?? ""}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-6 text-ash">{s.empty}</p>}
          </div>
        </div>
      </section>

      {/* Galeria editorial: off-white */}
      {gallery.length > 1 && (
        <section className="bg-bone">
          <div className="gutter mx-auto max-w-7xl py-14 md:py-20">
            <p className="font-display text-[clamp(2rem,8vw,3rem)] font-black uppercase leading-none text-ink [font-stretch:62%]">{s.gallery}</p>
            <ul className="mt-8 grid auto-rows-[38vw] grid-cols-2 gap-2 md:auto-rows-[15rem] md:grid-cols-4">
              {gallery.map((ph, i) => (
                <li key={ph.id} className={i === 0 ? "col-span-2 row-span-2" : ""}>
                  <FramedPhoto src={urls[ph.storage_path!]} x={ph.focal_x} y={ph.focal_y} zoom={ph.zoom} eager={i < 5} className="size-full" />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Disponibilidade e objetivos: verde gramado */}
      <section className="bg-turf">
        <div className="gutter mx-auto grid max-w-7xl gap-12 py-14 md:grid-cols-12 md:py-20">
          <div className="md:col-span-7">
            <SectionHead>{s.availability}</SectionHead>
            <dl className="mt-6 border-t border-white/20">
              {availability.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 border-b border-white/15 py-3.5">
                  <dt className="text-fog">{k}</dt>
                  <dd className="text-right font-display text-[1.35rem] font-extrabold uppercase leading-none [font-stretch:62%]">{v ?? <span className="text-ash">—</span>}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="md:col-span-5">
            <SectionHead>{s.seeking}</SectionHead>
            {a.seeking.length ? (
              <ul className="mt-6 flex flex-wrap gap-2">
                {a.seeking.map((k) => <li key={k} className="border border-bone/40 px-4 py-2 text-bone">{p.seeking[k]}</li>)}
              </ul>
            ) : <p className="mt-6 text-fog">{s.empty}</p>}
            {a.goals && <p className="mt-6 leading-relaxed text-fog">{a.goals}</p>}
          </div>
        </div>
      </section>

      <p className="gutter mx-auto max-w-7xl py-8 text-[0.8rem] text-ash">{s.privateNote}</p>
    </article>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-[clamp(2rem,8vw,3rem)] font-black uppercase leading-none [font-stretch:62%]">{children}</h2>;
}

function VideoCard({ v, p, s, big = false, className = "" }: { v: AthleteBundle["videos"][number]; p: PanelDictionary; s: PanelDictionary["sheet"]; big?: boolean; className?: string }) {
  return (
    <a href={v.url!} target="_blank" rel="noopener noreferrer" className={`group block ${className}`}>
      <span className="relative block aspect-video overflow-hidden bg-pitch">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={youtubeThumb(v.external_id!)} alt="" loading="lazy" className="size-full object-cover transition-transform duration-700 ease-[var(--ease-cine)] group-hover:scale-[1.04]" />
        <span aria-hidden className="absolute inset-0 bg-[linear-gradient(to_top,rgba(5,8,6,0.7),transparent_55%)]" />
        <span className={`absolute grid place-items-center border border-bone/70 bg-ink/40 backdrop-blur-sm transition-colors group-hover:bg-grass ${big ? "bottom-5 left-5 size-16" : "bottom-3 left-3 size-11"}`}>
          <svg viewBox="0 0 10 10" className={`ml-0.5 fill-bone ${big ? "size-4" : "size-3"}`} aria-hidden><path d="M2 1l7 4-7 4z" /></svg>
        </span>
      </span>
      <span className={`mt-3 block font-display font-extrabold uppercase leading-[0.95] [font-stretch:62%] ${big ? "text-[clamp(1.5rem,5vw,2.2rem)]" : "text-[1.2rem]"}`}>{v.title || "YouTube"}</span>
      <span className="mt-1 block text-[0.8rem] text-ash">{p.videos.types[v.video_type ?? "other"]} · {s.openYoutube}</span>
    </a>
  );
}
