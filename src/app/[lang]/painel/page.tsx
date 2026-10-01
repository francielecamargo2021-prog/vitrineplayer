import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale, htmlLang } from "@/i18n/config";
import { getPanelDictionary } from "@/i18n/get-dictionary";
import { activitySignals, getAthleteBundle, listMyAthletes, requireGuardian, signedPhotoUrls } from "@/lib/panel/data";
import { ageOn, categoryFor, completeness, type CompletenessGroup } from "@/domain/athlete";
import type { StepSlug } from "@/lib/panel/steps";
import { FramedPhoto } from "@/components/panel/FramedPhoto";
import { ghostButton, primaryButton } from "@/components/panel/controls";

const stepFor: Record<CompletenessGroup, StepSlug> = {
  personal: "dados", photos: "fotos", physical: "fisico", football: "futebol", traits: "perfil", availability: "disponibilidade", videos: "videos",
};

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
        <p className="eyebrow text-fog">{d.hello} {firstName}</p>
        <h1 className="mt-4 font-display text-[clamp(3.2rem,15vw,8rem)] font-black uppercase leading-[0.84] [font-stretch:62%]">
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
  const current = athletes.find((a) => a.id === wanted) ?? athletes[0];
  const bundle = await getAthleteBundle(supabase, user.id, current.id);
  const a = bundle.athlete;
  const primary = bundle.photos.find((ph) => ph.is_primary);
  const [urls, signals] = await Promise.all([
    signedPhotoUrls(supabase, primary?.storage_path ? [primary.storage_path] : []),
    activitySignals(supabase, a.id),
  ]);
  const { percent, missing } = completeness(bundle);
  const next = missing[0] ? stepFor[missing[0]] : "publicacao";
  const base = `/${lang}/painel/atleta/${a.id}`;
  const fmt = new Intl.DateTimeFormat(htmlLang[lang], { day: "numeric", month: "long" });
  const meta = [
    `${ageOn(a.birth_date)} ${d.age}`, a.category ?? categoryFor(a.birth_date),
    a.primary_position ? p.positions[a.primary_position] : null, a.current_club,
  ].filter(Boolean);

  return (
    <main className="gutter mx-auto max-w-7xl pb-24 pt-10 md:pt-14">
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-[clamp(2.4rem,10vw,4.5rem)] font-black uppercase leading-[0.86] [font-stretch:62%]">
            {d.hello} <span className="text-transparent [-webkit-text-stroke:0.02em_#efeee8]">{firstName}</span>
          </h1>
          <p className="mt-4 max-w-[52ch] leading-relaxed text-fog">{d.lead}</p>
        </div>
        <Link href={`/${lang}/painel/atleta/novo`} className={`${ghostButton} shrink-0`}>+ {d.addAthlete}</Link>
      </header>

      {athletes.length > 1 && (
        <nav aria-label={d.switchLabel} className="mt-10 flex gap-6 overflow-x-auto border-b border-white/10">
          {athletes.map((x) => (
            <Link
              key={x.id} href={`/${lang}/painel?atleta=${x.id}`} aria-current={x.id === a.id ? "page" : undefined}
              className={`-mb-px shrink-0 border-b-2 pb-3 font-display text-[1.25rem] font-extrabold uppercase [font-stretch:62%] transition-colors ${x.id === a.id ? "border-grass text-bone" : "border-transparent text-ash hover:text-bone"}`}
            >
              {x.sport_name || x.full_name}
            </Link>
          ))}
        </nav>
      )}

      {/* Atleta em destaque: foto grande + ficha */}
      <section className="mt-10 grid border-y border-white/10 md:grid-cols-12">
        <FramedPhoto
          src={primary?.storage_path ? urls[primary.storage_path] : null} x={primary?.focal_x} y={primary?.focal_y} zoom={primary?.zoom} eager
          className="aspect-[4/5] md:col-span-5 md:aspect-auto md:min-h-[34rem]"
        />
        <div className="flex flex-col py-8 md:col-span-7 md:py-10 md:pl-12">
          <p className="eyebrow flex flex-wrap gap-x-4 gap-y-1 text-fog">
            <span>{p.status.label}: <span className="text-bone">{p.status[a.status]}</span></span>
            {a.status === "approved" && <span>{p.visibility.label}: <span className="text-bone">{p.visibility[a.visibility]}</span></span>}
          </p>
          <h2 className="mt-4 font-display text-[clamp(3rem,12vw,6.5rem)] font-black uppercase leading-[0.82] [font-stretch:62%] text-[#e6e5de]">
            {a.sport_name || a.full_name}
          </h2>
          <p className="mt-4 text-[1.05rem] text-fog">{meta.join(" · ")}</p>

          <div className="mt-10 border-t border-white/10 pt-6">
            <div className="flex items-end justify-between gap-6">
              <p className="eyebrow text-fog">{d.completeness}</p>
              <p className="font-display text-[3.4rem] font-black leading-none [font-stretch:62%]">{percent}<span className="text-[0.5em] text-ash">%</span></p>
            </div>
            <div className="mt-3 h-[3px] w-full bg-white/10" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={d.completeness}>
              <div className="h-full bg-grass" style={{ width: `${percent}%` }} />
            </div>
            {missing.length > 0 && (
              <p className="mt-4 text-[0.9rem] text-ash">
                {d.missing}:{" "}
                {missing.map((g, i) => (
                  <span key={g}>
                    {i > 0 && " · "}
                    <Link href={`${base}/editar/${stepFor[g]}`} className="text-fog underline-offset-4 hover:text-bone hover:underline">{p.groups[g]}</Link>
                  </span>
                ))}
              </p>
            )}
            <p className="mt-4 max-w-[60ch] text-[0.85rem] leading-relaxed text-ash">{d.completenessNote}</p>
          </div>

          <div className="mt-auto flex flex-col gap-3 pt-10 sm:flex-row">
            <Link href={`${base}/editar/${next}`} className={`${primaryButton} w-full sm:w-auto sm:min-w-[16rem]`}>
              {percent < 100 ? d.complete : d.edit}
            </Link>
            <Link href={base} className={`${ghostButton} w-full sm:w-auto`}>{d.view}</Link>
          </div>
        </div>
      </section>

      {/* Atividade: só sinais reais, sem números */}
      <section className="mt-14 grid gap-6 md:grid-cols-12">
        <h2 className="font-display text-[1.8rem] font-extrabold uppercase leading-none [font-stretch:62%] md:col-span-4">{d.activityTitle}</h2>
        <div className="md:col-span-8">
          {signals.length === 0 ? (
            <p className="max-w-[60ch] leading-relaxed text-fog">{d.activityEmpty}</p>
          ) : (
            <ul className="divide-y divide-white/10 border-y border-white/10">
              {signals.map((s) => (
                <li key={s.kind} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between">
                  <span className="text-bone">{d.signals[s.kind]}</span>
                  <span className="text-[0.85rem] text-ash">{d.lastOn} {fmt.format(new Date(s.last_at))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
