import Link from "next/link";
import { notFound } from "next/navigation";
import { PendingNotice } from "@/components/portal/PortalShell";
import { hasLocale } from "@/i18n/config";
import { getPortalDictionary } from "@/i18n/get-dictionary";
import { myLists, requirePro } from "@/lib/portal/data";
import { CreateListForm } from "@/components/portal/PortalWidgets";
import { PortalTitle } from "@/components/portal/PortalTitle";

export default async function PortalLists({ params }: PageProps<"/[lang]/portal/listas">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const s = await requirePro(lang);
  if (!s) return null;
  if (!s.pro.approved) return <PendingNotice t={await getPortalDictionary(lang)} pro={s.pro} lang={lang} />;
  const [t, lists] = await Promise.all([getPortalDictionary(lang), myLists(s.user.id)]);
  return (
    <main className="gutter mx-auto max-w-4xl py-10 md:py-14">
      <PortalTitle title={t.lists.title} lead={t.lists.lead} />
      <div className="mt-8"><CreateListForm lang={lang} t={t.lists} error={t.common.error} /></div>
      {lists.length === 0 ? <p className="mt-10 text-fog">{t.lists.empty}</p> : (
        <ul className="mt-10 border-t border-white/12">
          {lists.map((l) => (
            <li key={l.id} className="border-b border-white/12">
              <Link href={`/${lang}/portal/listas/${l.id}`} className="flex min-h-14 items-center justify-between gap-4 py-3 text-bone hover:text-grass">
                <span>{l.name}</span><span className="text-[0.85rem] text-ash">{l.count} {t.lists.athletes}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
