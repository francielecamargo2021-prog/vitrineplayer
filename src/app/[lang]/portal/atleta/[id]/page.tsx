import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale, htmlLang } from "@/i18n/config";
import { getPanelDictionary, getPortalDictionary } from "@/i18n/get-dictionary";
import { athleteProfile, myLists, requireApprovedPro } from "@/lib/portal/data";
import { sendInterest } from "@/lib/portal/actions";
import { youtubeThumb, ADULT_AGE } from "@/domain/athlete";
import { FramedPhoto } from "@/components/panel/FramedPhoto";
import { FavoriteButton, InterestForm, ListToggles } from "@/components/portal/PortalWidgets";

/**
 * Ficha do atleta para o profissional. Os dados vêm de pro_athlete_profile(), que
 * confere a visibilidade, registra a visualização (sinal para a família) e aplica o
 * limite diário. Nunca há dado de contato, data de nascimento completa ou cidade.
 */
export default async function PortalAthlete({ params }: PageProps<"/[lang]/portal/atleta/[id]">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const s = await requireApprovedPro(lang);
  if (!s) return null;
  const [p, t, prof, lists] = await Promise.all([
    getPanelDictionary(lang), getPortalDictionary(lang), athleteProfile(s.user.id, id), myLists(s.user.id),
  ]);
  const f = t.profile;
  const back = <Link href={`/${lang}/portal`} className="text-[0.9rem] text-fog hover:text-bone">← {f.back}</Link>;
  if (prof === "limit" || prof === null) {
    return (
      <main className="gutter mx-auto max-w-3xl py-16">
        {back}
        <p className="mt-8 text-lg text-fog" data-testid={prof === "limit" ? "limite-diario" : "indisponivel"}>{prof === "limit" ? f.limit : f.notFound}</p>
      </main>
    );
  }
  const a = prof.card;
  const region = new Intl.DisplayNames([htmlLang[lang]], { type: "region" });
  const label = (map: Record<string, string>, k: string | null | undefined) => (k ? map[k] ?? k : null);
  const pos = (k: string | null) => label(p.positions as Record<string, string>, k);
  const answer = (k: string | null) => label(p.fields.travelAnswers as Record<string, string>, k);
  const yesNo = (v: boolean | null) => (v === null ? null : v ? f.yes : f.no);
  const primary = prof.photos.find((x) => x.primary) ?? prof.photos[0];
  const year = (d: string | null) => (d ? d.slice(0, 4) : null);

  const rows: [string, string | number | null | undefined][] = [
    [f.location, [a.state, region.of(a.country) ?? a.country].filter(Boolean).join(", ")],
    [f.modality, label(p.modalities as Record<string, string>, a.modality)],
    [f.position, pos(a.primary_position)],
    [f.secondary, a.secondary_positions?.map(pos).join(", ") || null],
    [f.foot, label(p.fields.feet as Record<string, string>, a.foot)],
    [f.height, a.height_cm ? `${a.height_cm} cm` : null],
    [f.weight, prof.weight_kg ? `${prof.weight_kg} kg${prof.measured_at ? ` (${f.measured} ${year(prof.measured_at)})` : ""}` : null],
    [f.club, a.current_club ? `${a.current_club}${prof.current_club_since ? ` · ${f.since} ${year(prof.current_club_since)}` : ""}` : null],
    [f.category, a.category],
    [f.federated, prof.federated === null ? null : `${yesNo(prof.federated)}${prof.federation ? ` · ${prof.federation}` : ""}`],
    [f.nationality, prof.nationality ? region.of(prof.nationality) ?? prof.nationality : null],
    [f.citizenships, prof.other_citizenships?.map((c) => region.of(c) ?? c).join(", ") || null],
    [f.passport, yesNo(prof.valid_passport)],
  ];
  const availability: [string, string | null][] = [
    [f.available, yesNo(a.available)],
    [f.travel, answer(prof.travel)],
    [f.relocateCity, answer(prof.relocate_city)],
    [f.relocateState, answer(prof.relocate_state)],
    [f.relocateAbroad, answer(prof.relocate_abroad)],
  ];
  const interestStatus = prof.interest?.status as keyof typeof t.interest.status | undefined;

  return (
    <main className="pb-16" data-testid="ficha-atleta">
      <div className="gutter mx-auto max-w-7xl pt-6">{back}</div>
      <section className="mx-auto mt-4 grid max-w-7xl lg:grid-cols-12">
        <FramedPhoto src={primary ? `/api/fotos/${primary.name}` : null} x={primary?.x} y={primary?.y} zoom={primary?.zoom} eager className="aspect-[4/5] lg:col-span-5" />
        <div className="gutter py-8 lg:col-span-7 lg:pl-12">
          <p className="text-[0.95rem] text-grass">{pos(a.primary_position)}{a.category ? ` · ${a.category}` : ""}</p>
          <h1 className="mt-2 font-display text-[clamp(3rem,12vw,7rem)] font-black uppercase leading-[0.84] [font-stretch:62%]" data-testid="nome-atleta">{a.display_name}</h1>
          <p className="mt-3 text-lg text-fog">{a.age} {f.years} · {f.born} {a.birth_year}</p>
          {a.age < ADULT_AGE && <p className="mt-2 text-[0.85rem] text-ash">{f.minorNote}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <FavoriteButton lang={lang} athleteId={a.id} on={a.is_favorite} labels={{ on: f.unfavorite, off: f.favorite }} />
          </div>
          <dl className="mt-8 grid gap-x-8 gap-y-3 border-t border-white/12 pt-6 sm:grid-cols-2">
            {rows.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-white/[0.06] pb-2 text-[0.95rem]">
                <dt className="text-ash">{k}</dt><dd className="text-right text-bone">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="gutter mx-auto mt-10 grid max-w-7xl gap-12 lg:grid-cols-12">
        <div className="space-y-12 lg:col-span-8">
          {(prof.bio || prof.goals || prof.experiences) && (
            <section className="space-y-6">
              {prof.bio && <div><h2 className="eyebrow text-fog">{f.bio}</h2><p className="mt-2 max-w-[65ch] leading-relaxed text-bone">{prof.bio}</p></div>}
              {prof.goals && <div><h2 className="eyebrow text-fog">{f.goals}</h2><p className="mt-2 max-w-[65ch] leading-relaxed text-bone">{prof.goals}</p></div>}
              {prof.experiences && <div><h2 className="eyebrow text-fog">{f.experiences}</h2><p className="mt-2 max-w-[65ch] leading-relaxed text-bone">{prof.experiences}</p></div>}
            </section>
          )}
          {prof.videos.length > 0 && (
            <section>
              <h2 className="font-display text-[clamp(2rem,7vw,3rem)] font-black uppercase leading-none [font-stretch:62%]">{f.videos}</h2>
              <ul className="mt-5 grid gap-5 sm:grid-cols-2">
                {prof.videos.map((v) => (
                  <li key={v.youtube}>
                    <a href={`https://www.youtube.com/watch?v=${v.youtube}`} target="_blank" rel="noopener noreferrer" className="group block">
                      <span className="relative block aspect-video overflow-hidden bg-pitch">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={youtubeThumb(v.youtube)} alt="" loading="lazy" className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                      </span>
                      <span className="mt-2 block font-semibold text-bone">{v.title || "YouTube"}</span>
                      {v.type && <span className="block text-[0.8rem] text-ash">{(p.videos.types as Record<string, string>)[v.type] ?? v.type}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {prof.photos.length > 1 && (
            <section>
              <h2 className="font-display text-[clamp(2rem,7vw,3rem)] font-black uppercase leading-none [font-stretch:62%]">{f.photos}</h2>
              <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {prof.photos.map((ph) => (
                  <li key={ph.name}><FramedPhoto src={`/api/fotos/${ph.name}`} x={ph.x} y={ph.y} zoom={ph.zoom} className="aspect-square" /></li>
                ))}
              </ul>
            </section>
          )}
          {(prof.clubs.length > 0 || prof.achievements.length > 0) && (
            <section className="grid gap-10 sm:grid-cols-2">
              {prof.clubs.length > 0 && (
                <div>
                  <h2 className="eyebrow text-fog">{f.clubs}</h2>
                  <ul className="mt-3 space-y-2">
                    {prof.clubs.map((c, i) => (
                      <li key={i} className="border-b border-white/[0.06] pb-2 text-[0.95rem] text-bone">
                        {c.club}{c.category ? ` · ${c.category}` : ""}
                        <span className="block text-[0.8rem] text-ash">{[year(c.from), c.to ? year(c.to) : f.present].filter(Boolean).join(" – ")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {prof.achievements.length > 0 && (
                <div>
                  <h2 className="eyebrow text-fog">{f.achievements}</h2>
                  <ul className="mt-3 space-y-2">
                    {prof.achievements.map((x, i) => (
                      <li key={i} className="border-b border-white/[0.06] pb-2 text-[0.95rem] text-bone">
                        {x.title}<span className="block text-[0.8rem] text-ash">{[x.competition, x.year].filter(Boolean).join(" · ")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
          {(availability.some(([, v]) => v) || a.seeking?.length) ? (
          <section>
            <h2 className="eyebrow text-fog">{f.availability}</h2>
            <dl className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {availability.filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-white/[0.06] pb-2 text-[0.95rem]"><dt className="text-ash">{k}</dt><dd className="text-bone">{v}</dd></div>
              ))}
            </dl>
            {a.seeking?.length ? (
              <p className="mt-4 text-[0.95rem] text-fog">{f.seeking}: <span className="text-bone">{a.seeking.map((k) => (p.seeking as Record<string, string>)[k] ?? k).join(", ")}</span></p>
            ) : null}
          </section>
          ) : null}
          <p className="text-[0.8rem] text-ash">{f.privacyNote}</p>
        </div>

        <aside className="space-y-10 lg:col-span-4">
          <section className="border-t border-white/12 pt-6">
            <h2 className="eyebrow text-bone">{f.lists}</h2>
            <div className="mt-4"><ListToggles lang={lang} athleteId={a.id} lists={lists} inLists={prof.lists} t={f} /></div>
          </section>
          <section className="border-t border-white/12 pt-6" data-testid="interesse">
            <h2 className="eyebrow text-bone">{t.interest.title}</h2>
            {interestStatus && interestStatus !== "expired" ? (
              <p className="mt-4 border-l-2 border-grass pl-4 text-bone" data-testid="interesse-status">{t.interest.status[interestStatus]}</p>
            ) : (
              <>
                <p className="mt-3 text-[0.9rem] leading-relaxed text-fog">{t.interest.lead}</p>
                <div className="mt-5"><InterestForm action={sendInterest.bind(null, lang, a.id)} t={t.interest} /></div>
              </>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
