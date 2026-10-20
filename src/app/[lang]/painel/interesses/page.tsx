import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale, htmlLang } from "@/i18n/config";
import { getPanelDictionary } from "@/i18n/get-dictionary";
import { requireGuardian } from "@/lib/panel/data";
import { receivedInterests } from "@/lib/panel/interests";
import { InterestActions } from "@/components/panel/InterestInbox";

/**
 * Interesses recebidos: chegam direto ao responsável, que decide. O contato oficial
 * da organização aparece só depois que a família aceita; nada da família vai para ela.
 */
export default async function ReceivedInterests({ params }: PageProps<"/[lang]/painel/interesses">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireGuardian(lang);
  if (!session) return null;
  const [p, rows] = await Promise.all([getPanelDictionary(lang), receivedInterests(session.user.id)]);
  const t = p.interests;
  const locale = htmlLang[lang];
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const region = new Intl.DisplayNames([locale], { type: "region" });
  return (
    <main className="gutter mx-auto max-w-5xl py-12 md:py-16">
      <Link href={`/${lang}/painel`} className="text-[0.9rem] text-fog hover:text-bone">← {p.shell.panel}</Link>
      <h1 className="mt-6 font-display text-[clamp(2.6rem,10vw,5.5rem)] font-black uppercase leading-[0.85] [font-stretch:62%]">
        <span className="block text-[#e6e5de]">{t.title[0]}</span>
        <span className="block text-transparent [-webkit-text-stroke:0.02em_#efeee8]">{t.title[1]}</span>
      </h1>
      <p className="mt-4 max-w-[60ch] text-fog">{t.lead}</p>
      {rows.length === 0 ? <p className="mt-10 text-fog">{t.empty}</p> : (
        <ul className="mt-10 border-t border-white/12">
          {rows.map((r) => (
            <li key={r.id} className="grid gap-6 border-b border-white/12 py-8 md:grid-cols-12" data-testid="interesse-recebido">
              <div className="md:col-span-5">
                <p className="eyebrow text-ash">{t.athlete}: <span className="text-fog">{r.athlete_name}</span></p>
                <p className="mt-3 font-display text-[1.8rem] font-extrabold uppercase leading-none [font-stretch:62%]">{r.org_name}</p>
                <p className="mt-2 text-[0.9rem] text-fog">
                  {(p.privacy.kinds as Record<string, string>)[r.org_kind] ?? r.org_kind} · {[r.org_city, r.org_state, region.of(r.org_country) ?? r.org_country].filter(Boolean).join(", ")}
                </p>
                <p className={`mt-1 text-[0.8rem] ${r.org_verified ? "text-grass" : "text-ash"}`}>{r.org_verified ? t.verified : t.notVerified}</p>
                {r.org_about && <p className="mt-3 text-[0.9rem] leading-relaxed text-fog">{r.org_about}</p>}
              </div>
              <div className="space-y-4 md:col-span-7">
                <p className="text-[0.8rem] text-ash">{t.received} {date.format(new Date(r.created_at))} · <span className="text-bone" data-testid="status">{t.status[r.status]}</span>
                  {r.blocked && <> · <span className="text-[#f0c4c4]">{t.blocked}</span></>}
                  {r.reported && <> · <span className="text-[#f0c4c4]">{t.reported}</span></>}
                </p>
                <blockquote className="border-l-2 border-white/20 pl-4 leading-relaxed text-bone">{r.message}</blockquote>
                {r.status === "accepted" && r.org_contact && (
                  <div className="border-l-2 border-grass pl-4" data-testid="contato-org">
                    <p className="text-[0.9rem] text-fog">{t.acceptedNote}</p>
                    <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-y-1 text-[0.9rem]">
                      {(["name", "role", "email", "phone", "website"] as const).filter((k) => r.org_contact![k]).map((k) => (
                        <div key={k} className="contents"><dt className="text-ash">{t.contact[k]}</dt><dd className="break-all text-bone">{r.org_contact![k]}</dd></div>
                      ))}
                    </dl>
                    <p className="mt-2 text-[0.8rem] text-ash">{t.acceptedPrivacy}</p>
                  </div>
                )}
                <InterestActions lang={lang} r={r} t={t} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
