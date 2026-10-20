import { notFound } from "next/navigation";
import { hasLocale, htmlLang } from "@/i18n/config";
import { getPanelDictionary, getPortalDictionary } from "@/i18n/get-dictionary";
import { requireApprovedPro, savedAthletes } from "@/lib/portal/data";
import { AthleteTile } from "@/components/portal/AthleteTile";
import { PortalTitle } from "@/components/portal/PortalTitle";

export default async function PortalFavorites({ params }: PageProps<"/[lang]/portal/favoritos">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const s = await requireApprovedPro(lang);
  if (!s) return null;
  const [p, t, rows] = await Promise.all([getPanelDictionary(lang), getPortalDictionary(lang), savedAthletes(s.user.id)]);
  const region = new Intl.DisplayNames([htmlLang[lang]], { type: "region" });
  return (
    <main className="gutter mx-auto max-w-7xl py-10 md:py-14">
      <PortalTitle title={t.favorites.title} lead={t.favorites.lead} />
      {rows.length === 0 ? <p className="mt-10 text-fog">{t.favorites.empty}</p> : (
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {rows.map((a) => <AthleteTile key={a.id} a={a} lang={lang} p={p} t={t} region={region} />)}
        </ul>
      )}
    </main>
  );
}
