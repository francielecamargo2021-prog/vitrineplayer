import Link from "next/link";
import { notFound } from "next/navigation";
import { PendingNotice } from "@/components/portal/PortalShell";
import { hasLocale, htmlLang } from "@/i18n/config";
import { getPortalDictionary } from "@/i18n/get-dictionary";
import { myInterests, requirePro } from "@/lib/portal/data";
import { PortalTitle } from "@/components/portal/PortalTitle";

/** Interesses enviados pela organização: só o status (a família decide; nada dela é compartilhado). */
export default async function PortalInterests({ params }: PageProps<"/[lang]/portal/interesses">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const s = await requirePro(lang);
  if (!s) return null;
  if (!s.pro.approved) return <PendingNotice t={await getPortalDictionary(lang)} pro={s.pro} lang={lang} />;
  const [t, rows] = await Promise.all([getPortalDictionary(lang), myInterests(s.user.id)]);
  const date = new Intl.DateTimeFormat(htmlLang[lang], { dateStyle: "medium" });
  return (
    <main className="gutter mx-auto max-w-4xl py-10 md:py-14">
      <PortalTitle title={t.interests.title} lead={t.interests.lead} />
      {rows.length === 0 ? <p className="mt-10 text-fog">{t.interests.empty}</p> : (
        <ul className="mt-10 border-t border-white/12">
          {rows.map((r) => (
            <li key={r.id} className="grid gap-2 border-b border-white/12 py-5 md:grid-cols-12" data-testid="interesse-enviado">
              <div className="md:col-span-4">
                {r.athlete_name ? (
                  <Link href={`/${lang}/portal/atleta/${r.athlete_id}`} className="text-bone hover:text-grass">{r.athlete_name}</Link>
                ) : <span className="text-ash">{t.interest.unavailable}</span>}
                <p className="text-[0.8rem] text-ash">{t.interests.sentOn} {date.format(new Date(r.created_at))}</p>
                <p className="text-[0.8rem] text-grass" data-testid="finalidade">{(t.interest.purposes as Record<string, string>)[r.purpose] ?? t.interest.purposes.general}</p>
              </div>
              <p className="text-[0.9rem] text-fog md:col-span-5">{r.message}</p>
              <p className="text-[0.9rem] text-bone md:col-span-3 md:text-right" data-testid="status">
                {(t.interest.status as Record<string, string>)[r.status] ?? r.status}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
