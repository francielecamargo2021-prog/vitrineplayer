import Link from "next/link";
import { notFound } from "next/navigation";
import { PendingNotice } from "@/components/portal/PortalShell";
import { hasLocale, htmlLang } from "@/i18n/config";
import { getPanelDictionary, getPortalDictionary } from "@/i18n/get-dictionary";
import { requirePro, stages, trackedAthletes, updatedIds, type Stage } from "@/lib/portal/data";
import { AthleteTile } from "@/components/portal/AthleteTile";
import { PortalTitle } from "@/components/portal/PortalTitle";

/** Funil de acompanhamento da organização (Observando → … → Arquivado). */
export default async function PortalTracking({ params, searchParams }: PageProps<"/[lang]/portal/acompanhamento">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const s = await requirePro(lang);
  if (!s) return null;
  if (!s.pro.approved) return <PendingNotice t={await getPortalDictionary(lang)} pro={s.pro} lang={lang} />;
  const sp = await searchParams;
  const stage = (stages as readonly string[]).includes(String(sp.etapa)) ? (sp.etapa as Stage) : undefined;
  const [p, t, all] = await Promise.all([getPanelDictionary(lang), getPortalDictionary(lang), trackedAthletes(s.user.id)]);
  const rows = stage ? all.filter((r) => r.stage === stage) : all.filter((r) => r.stage !== "archived");
  const counts = Object.fromEntries(stages.map((k) => [k, all.filter((r) => r.stage === k).length]));
  const region = new Intl.DisplayNames([htmlLang[lang]], { type: "region" });
  const updated = await updatedIds(s.user.id, rows.map((x) => x.id));
  const base = `/${lang}/portal/acompanhamento`;
  const pill = (href: string, label: string, current: boolean) => (
    <Link key={href} href={href} aria-current={current ? "page" : undefined}
      className={`inline-flex min-h-11 items-center border px-4 text-[0.9rem] transition-colors ${current ? "border-grass bg-grass/15 text-bone" : "border-white/15 text-fog hover:border-white/40"}`}>{label}</Link>
  );
  return (
    <main className="gutter mx-auto max-w-7xl py-10 md:py-14">
      <PortalTitle title={t.tracking.title} lead={t.tracking.lead} />
      <nav aria-label={t.workspace.stage} className="mt-8 flex flex-wrap gap-2" data-testid="funil">
        {pill(base, `${t.tracking.all} (${all.length - counts.archived})`, !stage)}
        {stages.map((k) => pill(`${base}?etapa=${k}`, `${t.workspace.stages[k]} (${counts[k]})`, stage === k))}
      </nav>
      {rows.length === 0 ? <p className="mt-10 text-fog">{t.tracking.empty}</p> : (
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {rows.map((a) => <AthleteTile key={a.id} a={a} lang={lang} p={p} t={t} region={region} updated={updated.has(a.id)} badge={t.workspace.stages[a.stage]} />)}
        </ul>
      )}
    </main>
  );
}
