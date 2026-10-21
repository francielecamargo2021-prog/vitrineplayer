import { notFound } from "next/navigation";
import { PendingNotice } from "@/components/portal/PortalShell";
import { hasLocale, htmlLang } from "@/i18n/config";
import { getPortalDictionary } from "@/i18n/get-dictionary";
import { requirePro, team } from "@/lib/portal/data";
import { PortalTitle } from "@/components/portal/PortalTitle";
import { InviteBox, TeamButton } from "@/components/portal/TeamWidgets";

/** Equipe da organização (até 5 pessoas). Só quem cadastrou a organização convida e remove. */
export default async function PortalTeam({ params }: PageProps<"/[lang]/portal/equipe">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const s = await requirePro(lang);
  if (!s) return null;
  const t = await getPortalDictionary(lang);
  if (!s.pro.approved) return <PendingNotice t={t} pro={s.pro} lang={lang} />;
  const { members, invites } = await team(s.user.id);
  const owner = Boolean(s.pro.organization?.is_owner);
  const date = new Intl.DateTimeFormat(htmlLang[lang], { dateStyle: "medium" });
  const free = 5 - members.length - invites.length;
  return (
    <main className="gutter mx-auto max-w-4xl py-10 md:py-14">
      <PortalTitle title={t.team.title} lead={t.team.lead} />
      <ul className="mt-10 border-t border-white/12" data-testid="equipe">
        {members.map((m) => (
          <li key={m.profile_id} className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 py-4">
            <span><span className="text-bone">{m.full_name}</span><span className="text-[0.85rem] text-ash"> · {m.email}{m.is_owner ? ` · ${t.team.owner}` : ""}</span></span>
            {owner && !m.is_owner && <TeamButton kind="remove" lang={lang} id={m.profile_id} label={t.team.remove} />}
          </li>
        ))}
        {owner && invites.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 py-4 text-[0.9rem] text-fog">
            <span>{t.team.pending} {date.format(new Date(i.expires_at))}</span>
            <TeamButton kind="revoke" lang={lang} id={i.id} label={t.team.revoke} />
          </li>
        ))}
      </ul>
      <div className="mt-10">
        {owner ? (free > 0 ? <InviteBox lang={lang} t={t.team} /> : <p className="text-fog">{t.team.full}</p>) : <p className="text-[0.9rem] text-ash">{t.team.onlyOwner}</p>}
      </div>
    </main>
  );
}
