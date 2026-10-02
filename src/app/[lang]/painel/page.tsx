import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale, htmlLang } from "@/i18n/config";
import { getPanelDictionary } from "@/i18n/get-dictionary";
import { activitySignals, getAthleteBundle, listMyAthletes, requireGuardian, signedPhotoUrls } from "@/lib/panel/data";
import { ageOn, categoryFor, completeness, completenessGroups, type ActivityKind, type CompletenessGroup } from "@/domain/athlete";
import type { StepSlug } from "@/lib/panel/steps";
import { FramedPhoto } from "@/components/panel/FramedPhoto";
import { primaryButton } from "@/components/panel/controls";

const stepFor: Record<CompletenessGroup, StepSlug> = {
  personal: "dados", photos: "fotos", physical: "fisico", football: "futebol", traits: "perfil", availability: "disponibilidade", videos: "videos",
};
const activityKinds: ActivityKind[] = ["view", "search_appearance", "interest"];

/** Glifos finos (linha 1.5px) para os três tipos de sinal. */
function Glyph({ kind }: { kind: ActivityKind }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.5 } as const;
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-6">
      {kind === "view" && (<><path {...common} d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle {...common} cx="12" cy="12" r="3" /></>)}
      {kind === "search_appearance" && (<><circle {...common} cx="10.5" cy="10.5" r="6" /><path {...common} d="M15 15l6 6" /></>)}
      {kind === "interest" && (<><circle {...common} cx="12" cy="12" r="2.5" /><circle {...common} cx="12" cy="12" r="6.5" /><circle {...common} cx="12" cy="12" r="10" strokeOpacity="0.45" /></>)}
    </svg>
  );
}

/** Nome em duas vozes, como no Hero: primeira palavra cheia, última em contorno. */
function AthleteName({ name, className = "" }: { name: string; className?: string }) {
  const words = name.split(" ");
  const last = words.length > 1 ? words.pop() : null;
  return (
    <h1 className={`font-display font-black uppercase leading-[0.82] [font-stretch:62%] ${className}`}>
      <span className="block text-[#e6e5de]">{words.join(" ")}</span>
      {last && <span className="block text-transparent [-webkit-text-stroke:0.018em_#efeee8]">{last}</span>}
    </h1>
  );
}

export default async function Dashboard({ params, searchParams }: PageProps<"/[lang]/painel">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireGuardian(lang);
  if (!session) return null;
  const { supabase, user, profile } = session;
  const p = await getPanelDictionary(lang);
  const d = p.dashboard;
  const athletes = await listMyAthletes(supabase, user.id);
  const firstName = profile.full_name.split(" ")[0];

  if (!athletes.length) {
    return (
      <main className="gutter mx-auto max-w-6xl py-14 md:py-20">
        <p className="eyebrow text-ash">{d.area} · <span className="text-fog">{firstName}</span></p>
        <h1 className="mt-6 font-display text-[clamp(3.2rem,15vw,8rem)] font-black uppercase leading-[0.84] [font-stretch:62%]">
          <span className="block text-[#e6e5de]">{d.emptyTitle[0]}</span>
          <span className="block text-transparent [-webkit-text-stroke:0.018em_#efeee8]">{d.emptyTitle[1]}</span>
        </h1>
        <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-fog">{d.emptyBody}</p>
        <Link href={`/${lang}/painel/atleta/novo`} className={`${primaryButton} mt-10 w-full sm:w-auto sm:min-w-[18rem]`}>{d.addAthlete}</Link>
      </main>
    );
  }

  const sp = await searchParams;
  const wanted = typeof sp.atleta === "string" ? sp.atleta : null;
  const current = athletes.find((x) => x.id === wanted) ?? athletes[0];
  const bundle = await getAthleteBundle(supabase, user.id, current.id);
  const a = bundle.athlete;
  const primary = bundle.photos.find((ph) => ph.is_primary);
  const [urls, signals] = await Promise.all([
    signedPhotoUrls(supabase, primary?.storage_path ? [primary.storage_path] : []),
    activitySignals(supabase, a.id),
  ]);
  const { percent, missing, ratios } = completeness(bundle);
  const next = missing[0] ? stepFor[missing[0]] : "publicacao";
  const base = `/${lang}/painel/atleta/${a.id}`;
  const locale = htmlLang[lang];
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" });
  const region = new Intl.DisplayNames([locale], { type: "region" });
  const live = a.status === "approved" && a.visibility === "active";
  const signal = new Map(signals.map((s) => [s.kind, s.last_at]));
  const name = a.sport_name || a.full_name;

  const hintGroups = missing.slice(0, 3).map((g) => d.hintGroups[g]);
  const hint = hintGroups.length
    ? `${d.hintStart} ${hintGroups.length > 1 ? `${hintGroups.slice(0, -1).join(", ")} ${d.and} ${hintGroups.at(-1)}` : hintGroups[0]} ${d.hintEnd}`
    : d.hintDone;

  const facts: [string, string | null][] = [
    [p.fields.age, `${ageOn(a.birth_date)} ${d.age}`],
    [p.fields.category, a.category ?? categoryFor(a.birth_date)],
    [p.fields.primaryPosition, a.primary_position ? p.positions[a.primary_position] : null],
    [p.fields.currentClub, a.current_club],
    [d.location, [a.city, region.of(a.country)].filter(Boolean).join(", ") || null],
  ];
  const statusTone = a.status === "approved" ? "bg-grass" : a.status === "rejected" ? "bg-[#d9a38f]" : a.status === "draft" ? "bg-ash" : "bg-signal-soft";

  return (
    <main className="pb-20">
      {/* Conta: saudação discreta, troca de atleta, novo atleta */}
      <section className="gutter mx-auto max-w-7xl pt-8 md:pt-10">
        <div className="flex items-end justify-between gap-4">
          <p className="text-[0.95rem] text-fog">
            <span className="eyebrow block text-ash">{d.area}</span>
            {d.hello} <span className="text-bone">{firstName}</span>
          </p>
          <Link href={`/${lang}/painel/atleta/novo`} className="inline-flex h-11 shrink-0 items-center border border-white/20 px-4 text-[0.875rem] font-medium text-bone transition-colors hover:border-bone">
            + {d.addAthlete}
          </Link>
        </div>
        {athletes.length > 1 && (
          <nav aria-label={d.switchLabel} className="-mx-4 mt-6 flex gap-6 overflow-x-auto px-4 md:mx-0 md:px-0">
            {athletes.map((x) => (
              <Link
                key={x.id} href={`/${lang}/painel?atleta=${x.id}`} aria-current={x.id === a.id ? "page" : undefined}
                className={`shrink-0 border-b-2 pb-2 font-display text-[1.3rem] font-extrabold uppercase [font-stretch:62%] transition-colors ${x.id === a.id ? "border-grass text-bone" : "border-transparent text-ash hover:text-bone"}`}
              >
                {x.sport_name || x.full_name}
              </Link>
            ))}
          </nav>
        )}
      </section>

      {/* Atleta: protagonista */}
      <section className="mt-6 bg-pitch md:mt-8">
        <div className="mx-auto grid max-w-7xl md:grid-cols-12">
          <div className="relative md:col-span-5">
            <FramedPhoto
              src={primary?.storage_path ? urls[primary.storage_path] : null} x={primary?.focal_x} y={primary?.focal_y} zoom={primary?.zoom} eager
              className="aspect-[4/5] w-full md:aspect-auto md:h-full md:min-h-[38rem]"
            />
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,#0c2418_0%,rgba(12,36,24,0.55)_28%,rgba(12,36,24,0)_55%)] md:hidden" />
            <div className="gutter absolute inset-x-0 bottom-0 pb-6 md:hidden">
              <AthleteName name={name} className="text-[clamp(3.4rem,19vw,5.5rem)]" />
            </div>
          </div>

          <div className="gutter flex flex-col pb-10 pt-6 md:col-span-7 md:px-12 md:py-12">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[0.85rem] text-fog">
              <span className="inline-flex items-center gap-2"><span className={`size-2 ${statusTone}`} />{p.status[a.status]}</span>
              {a.status === "approved" && (
                <span className="inline-flex items-center gap-2"><span className={`size-2 ${a.visibility === "active" ? "bg-grass" : "bg-ash"}`} />{p.visibility.label}: {p.visibility[a.visibility]}</span>
              )}
            </div>
            <AthleteName name={name} className="mt-5 hidden text-[clamp(4rem,8.5vw,7.5rem)] md:block" />

            <dl className="mt-6 grid grid-cols-2 gap-x-6 border-t border-white/12 sm:grid-cols-3 md:mt-10">
              {facts.map(([k, v]) => (
                <div key={k} className="border-b border-white/[0.08] py-3.5">
                  <dt className="text-[0.75rem] text-ash">{k}</dt>
                  <dd className="mt-0.5 text-[1rem] text-bone">{v ?? <span className="text-ash">—</span>}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center md:mt-auto md:pt-10">
              <Link href={`${base}/editar/${next}`} className={`${primaryButton} w-full sm:w-auto sm:min-w-[15rem]`}>
                {percent < 100 ? d.complete : d.edit}
              </Link>
              <div className="flex gap-6 text-[0.9rem] font-medium sm:ml-4">
                <Link href={base} className="text-bone underline decoration-white/30 underline-offset-[6px] hover:decoration-bone">{d.preview}</Link>
                <Link href={`${base}/editar/privacidade`} className="text-bone underline decoration-white/30 underline-offset-[6px] hover:decoration-bone">{d.privacy}</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Completude: faixa clara, orienta sem gamificar */}
      <section className="bg-bone text-ink">
        <div className="gutter mx-auto grid max-w-7xl gap-8 py-10 md:grid-cols-12 md:py-14">
          <div className="md:col-span-4">
            <p className="font-display text-[clamp(5rem,22vw,8.5rem)] font-black leading-[0.8] [font-stretch:62%]">
              {percent}<span className="text-[0.45em] text-turf">%</span>
            </p>
            <p className="mt-2 text-[0.95rem] text-[#3b4a42]">{d.completeSuffix}</p>
          </div>
          <div className="md:col-span-8 md:pt-3">
            <p className="max-w-[40ch] font-display text-[clamp(1.6rem,6vw,2.3rem)] font-extrabold uppercase leading-[0.95] [font-stretch:62%]">{hint}</p>
            <ol className="mt-8 grid grid-cols-7 gap-1.5" aria-label={d.completeness}>
              {completenessGroups.map((g) => (
                <li key={g}>
                  <Link href={`${base}/editar/${stepFor[g]}`} className="group block" title={p.groups[g]}>
                    <span className="block h-1.5 bg-ink/10">
                      <span className="block h-full bg-turf" style={{ width: `${Math.round(ratios[g] * 100)}%` }} />
                    </span>
                    <span className={`mt-2 hidden text-[0.75rem] leading-tight group-hover:underline sm:block ${ratios[g] < 1 ? "text-ink" : "text-[#6b7a71]"}`}>{p.groups[g]}</span>
                  </Link>
                </li>
              ))}
            </ol>
            <p className="mt-6 max-w-[62ch] text-[0.85rem] leading-relaxed text-[#56645c]">{d.completenessNote}</p>
          </div>
        </div>
      </section>

      {/* Atividade do perfil: sinais reais, sem números, sem identidade */}
      <section className="bg-graphite">
        <div className="gutter mx-auto max-w-7xl py-12 md:py-16">
          <div className="grid gap-4 md:grid-cols-12">
            <h2 className="font-display text-[clamp(2.2rem,9vw,3.6rem)] font-black uppercase leading-[0.85] [font-stretch:62%] md:col-span-5">{d.activity.title}</h2>
            <div className="md:col-span-7">
              <p className="max-w-[56ch] leading-relaxed text-fog">{d.activity.lead}</p>
              {!live && <p className="mt-3 border-l-2 border-grass/60 pl-3 text-[0.9rem] text-ash">{d.activity.notLive}</p>}
            </div>
          </div>
          <ul className="mt-10 grid border-t border-white/12 md:grid-cols-3">
            {activityKinds.map((k) => {
              const at = signal.get(k);
              return (
                <li key={k} className="flex gap-4 border-b border-white/[0.08] py-6 md:flex-col md:border-b-0 md:border-r md:px-6 md:first:pl-0 md:last:border-r-0">
                  <span className={at ? "text-grass" : "text-steel"}><Glyph kind={k} /></span>
                  <div>
                    <p className="font-display text-[1.35rem] font-extrabold uppercase leading-none [font-stretch:62%]">{d.activity.rows[k].title}</p>
                    <p className={`mt-2 text-[0.95rem] leading-snug ${at ? "text-bone" : "text-ash"}`}>{at ? d.activity.rows[k].on : d.activity.empty}</p>
                    {at && <p className="mt-1 text-[0.8rem] text-ash">{d.lastOn} {fmt.format(new Date(at))}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </main>
  );
}
