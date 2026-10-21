import Link from "next/link";
import { notFound } from "next/navigation";
import { PendingNotice } from "@/components/portal/PortalShell";
import { hasLocale, htmlLang } from "@/i18n/config";
import { getPanelDictionary, getPortalDictionary } from "@/i18n/get-dictionary";
import { myLists, requirePro, savedAthletes, updatedIds } from "@/lib/portal/data";
import { AthleteTile } from "@/components/portal/AthleteTile";
import { DeleteListButton, RemoveFromListButton } from "@/components/portal/PortalWidgets";
import { PortalTitle } from "@/components/portal/PortalTitle";

export default async function PortalList({ params }: PageProps<"/[lang]/portal/listas/[id]">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const s = await requirePro(lang);
  if (!s) return null;
  if (!s.pro.approved) return <PendingNotice t={await getPortalDictionary(lang)} pro={s.pro} lang={lang} />;
  const lists = await myLists(s.user.id);
  const list = lists.find((l) => l.id === id);
  if (!list) notFound();
  const [p, t, rows] = await Promise.all([getPanelDictionary(lang), getPortalDictionary(lang), savedAthletes(s.user.id, id)]);
  const region = new Intl.DisplayNames([htmlLang[lang]], { type: "region" });
  const updated = await updatedIds(s.user.id, rows.map((x) => x.id));
  return (
    <main className="gutter mx-auto max-w-7xl py-10 md:py-14">
      <Link href={`/${lang}/portal/listas`} className="text-[0.9rem] text-fog hover:text-bone">← {t.lists.back}</Link>
      <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <PortalTitle title={[list.name]} />
        {list.mine && <DeleteListButton lang={lang} listId={id} t={t.lists} />}
      </div>
      {rows.length === 0 ? <p className="mt-10 text-fog">{t.lists.emptyList}</p> : (
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {rows.map((a) => (
            <AthleteTile key={a.id} a={a} lang={lang} p={p} t={t} region={region} updated={updated.has(a.id)}
              extra={<RemoveFromListButton lang={lang} listId={id} athleteId={a.id} label={t.lists.remove} />} />
          ))}
        </ul>
      )}
    </main>
  );
}
