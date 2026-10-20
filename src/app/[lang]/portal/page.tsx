import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale, htmlLang } from "@/i18n/config";
import { getPanelDictionary, getPortalDictionary } from "@/i18n/get-dictionary";
import { readFilters, requireApprovedPro, searchAthletes } from "@/lib/portal/data";
import { countryOptions, feet, modalities, positions, seekingKinds, sexes } from "@/domain/athlete";
import { SelectField, TextField, ghostButton, primaryButton } from "@/components/panel/controls";
import { AthleteTile } from "@/components/portal/AthleteTile";

/** Busca de atletas (filtros na URL; o banco filtra e aplica todas as regras de visibilidade). */
export default async function PortalSearch({ params, searchParams }: PageProps<"/[lang]/portal">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const s = await requireApprovedPro(lang);
  if (!s) return null;
  const sp = await searchParams;
  const filters = readFilters(sp);
  const page = Math.max(1, Math.min(500, Number(sp.pagina) || 1));
  const [p, t, result] = await Promise.all([getPanelDictionary(lang), getPortalDictionary(lang), searchAthletes(s.user.id, filters, page)]);
  const f = t.search;
  const region = new Intl.DisplayNames([htmlLang[lang]], { type: "region" });
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const qs = (n: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) for (const x of [v].flat()) if (x && k !== "pagina") u.append(k, String(x));
    u.set("pagina", String(n));
    return `?${u}`;
  };
  const opts = (keys: readonly string[], labels: Record<string, string>) => keys.map((k) => ({ value: k, label: labels[k] ?? k }));
  const check = (name: string, label: string, on: boolean) => (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[0.9rem] text-fog">
      <input type="checkbox" name={name} value="1" defaultChecked={on} className="size-5 accent-[#4f9a6a]" />
      {label}
    </label>
  );

  return (
    <main className="gutter mx-auto max-w-7xl py-10 md:py-14">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-[clamp(2.6rem,10vw,5.5rem)] font-black uppercase leading-[0.85] [font-stretch:62%]">
            <span className="block text-[#e6e5de]">{f.title[0]}</span>
            <span className="block text-transparent [-webkit-text-stroke:0.02em_#efeee8]">{f.title[1]}</span>
          </h1>
          <p className="mt-4 max-w-[60ch] text-fog">{f.lead}</p>
        </div>
        <dl className="flex gap-6 text-[0.85rem]">
          <div><dt className="text-ash">{f.usage}</dt><dd className="font-mono text-bone">{s.pro.usage.views_today}/{s.pro.limits.views_per_day}</dd></div>
          <div><dt className="text-ash">{f.interestsUsage}</dt><dd className="font-mono text-bone">{s.pro.usage.interests_month}/{s.pro.limits.interests_per_month}</dd></div>
        </dl>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[18rem_1fr]">
        <form method="get" className="space-y-5 border-t border-white/12 pt-6 lg:border-t-0 lg:pt-0" aria-label={f.filters}>
          <p className="eyebrow text-bone">{f.filters}</p>
          <SelectField label={f.modality} name="modalidade" placeholder={f.any} defaultValue={filters.modality} options={opts(modalities, p.modalities)} />
          <fieldset>
            <legend className="eyebrow text-fog">{f.position}</legend>
            <div className="mt-2 grid grid-cols-2 gap-x-3">
              {positions.map((pos) => (
                <label key={pos} className="flex min-h-10 cursor-pointer items-center gap-2 text-[0.85rem] text-fog">
                  <input type="checkbox" name="posicao" value={pos} defaultChecked={filters.positions?.includes(pos)} className="size-4 accent-[#4f9a6a]" />
                  {(p.positions as Record<string, string>)[pos]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <TextField label={f.ageMin} name="idade_min" type="number" min={5} max={60} defaultValue={filters.age_min} />
            <TextField label={f.ageMax} name="idade_max" type="number" min={5} max={60} defaultValue={filters.age_max} />
          </div>
          <SelectField label={f.sex} name="sexo" placeholder={f.any} defaultValue={filters.sex} options={opts(sexes, p.fields.sexes)} />
          <SelectField label={f.foot} name="pe" placeholder={f.any} defaultValue={filters.foot} options={opts(feet, p.fields.feet)} />
          <TextField label={f.heightMin} name="altura_min" type="number" min={80} max={230} defaultValue={filters.height_min} />
          <SelectField label={f.country} name="pais" placeholder={f.any} defaultValue={filters.country} options={countryOptions(htmlLang[lang])} />
          <TextField label={f.state} name="estado" maxLength={60} defaultValue={filters.state} />
          <SelectField label={f.seeking} name="busca" placeholder={f.any} defaultValue={filters.seeking} options={opts(seekingKinds, p.seeking)} />
          <div>
            {check("disponivel", f.available, Boolean(filters.available))}
            {check("exterior", f.abroad, Boolean(filters.relocate_abroad))}
            {check("video", f.withVideo, Boolean(filters.with_video))}
          </div>
          <div className="flex gap-3">
            <button className={`${primaryButton} flex-1`}>{f.apply}</button>
            <Link href={`/${lang}/portal`} className={ghostButton}>{f.clear}</Link>
          </div>
        </form>

        <section aria-live="polite">
          <p className="text-[0.95rem]"><span className="font-mono text-bone" data-testid="total">{result.total}</span> <span className="text-fog">{f.results}</span></p>
          {result.rows.length === 0 ? (
            <p className="mt-8 text-fog">{f.none}</p>
          ) : (
            <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {result.rows.map((a) => <AthleteTile key={a.id} a={a} lang={lang} p={p} t={t} region={region} />)}
            </ul>
          )}
          {pages > 1 && (
            <nav className="mt-8 flex items-center justify-between gap-4 text-[0.9rem]" aria-label={f.page}>
              {page > 1 ? <Link href={qs(page - 1)} className={ghostButton}>{f.prev}</Link> : <span />}
              <span className="text-ash">{f.page} {page} / {pages}</span>
              {page < pages ? <Link href={qs(page + 1)} className={ghostButton}>{f.next}</Link> : <span />}
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}
