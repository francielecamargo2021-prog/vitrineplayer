import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getPanelDictionary } from "@/i18n/get-dictionary";
import { athleteStatuses, listAthletesByStatus, requireAdmin } from "@/lib/admin/data";
import { ageOn, type AthleteStatus } from "@/domain/athlete";

export default async function AdminAthletes({ params, searchParams }: PageProps<"/[lang]/admin/atletas">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireAdmin(lang);
  if (!session) return null;
  const sp = await searchParams;
  const status = (athleteStatuses as string[]).includes(String(sp.situacao)) ? (sp.situacao as AthleteStatus) : "in_review";
  const [p, rows] = await Promise.all([getPanelDictionary("pt"), listAthletesByStatus(session.db, status)]);
  const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

  return (
    <main className="gutter mx-auto max-w-6xl py-12 md:py-16">
      <h1 className="font-display text-[clamp(2.6rem,10vw,5.5rem)] font-black uppercase leading-[0.85] [font-stretch:62%]">Atletas</h1>
      <nav aria-label="Situação" className="mt-8 flex flex-wrap gap-2">
        {athleteStatuses.map((s) => (
          <Link key={s} href={`/${lang}/admin/atletas?situacao=${s}`} aria-current={s === status ? "page" : undefined}
            className={`inline-flex min-h-11 items-center border px-4 text-[0.9rem] transition-colors ${s === status ? "border-grass bg-grass/15 text-bone" : "border-white/15 text-fog hover:border-white/40"}`}>
            {p.status[s]}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="mt-10 text-fog">Nenhum atleta nesta situação.</p>
      ) : (
        <ul className="mt-8 border-t border-white/12">
          {rows.map((a) => (
            <li key={a.id} className="border-b border-white/12">
              <Link href={`/${lang}/admin/atletas/${a.id}`} className="flex flex-col gap-1 py-4 transition-colors hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between sm:px-3">
                <span>
                  <span className="block text-bone">{a.sport_name || a.full_name}</span>
                  <span className="text-[0.85rem] text-ash">
                    {a.full_name} · {ageOn(a.birth_date)} anos · {a.primary_position ? p.positions[a.primary_position] : "posição não informada"}
                    {a.city ? ` · ${a.city}` : ""}{a.state ? `/${a.state}` : ""} · {a.country}
                  </span>
                </span>
                <span className="text-[0.8rem] text-ash">
                  {status === "in_review" && a.submitted_at ? `enviado ${date.format(new Date(a.submitted_at))}` : `atualizado ${date.format(new Date(a.updated_at))}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
