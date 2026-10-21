import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getPanelDictionary } from "@/i18n/get-dictionary";
import { athleteStatuses, listAthletes, requireAdmin } from "@/lib/admin/data";
import { ageOn, positions, type AthleteStatus } from "@/domain/athlete";
import { AdminTitle, Pills, fmtDate } from "@/components/admin/AdminUi";

export default async function AdminAthletes({ params, searchParams }: PageProps<"/[lang]/admin/atletas">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireAdmin(lang);
  if (!session) return null;
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const status = (athleteStatuses as string[]).includes(String(sp.situacao)) ? (sp.situacao as AthleteStatus) : "in_review";
  const filters = {
    status,
    country: /^[A-Z]{2}$/.test(one("pais") ?? "") ? one("pais") : undefined,
    position: (positions as string[]).includes(one("posicao") ?? "") ? one("posicao") : undefined,
    visibility: ["active", "paused", "hidden"].includes(one("visibilidade") ?? "") ? one("visibilidade") : undefined,
    q: one("q")?.slice(0, 80),
  };
  const [p, rows] = await Promise.all([getPanelDictionary("pt"), listAthletes(session, filters)]);
  const base = `/${lang}/admin/atletas`;
  const keep = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ situacao: status, pais: filters.country, posicao: filters.position, visibilidade: filters.visibility, q: filters.q, ...extra })) if (v) u.set(k, v);
    return `${base}?${u}`;
  };
  const select = "h-11 border border-white/15 bg-ink px-3 text-[0.9rem] text-bone";

  return (
    <main className="gutter mx-auto max-w-6xl space-y-8 py-12 md:py-16">
      <AdminTitle>Atletas</AdminTitle>
      <Pills label="Situação" items={athleteStatuses.map((s) => ({ href: keep({ situacao: s }), label: p.status[s], current: s === status }))} />
      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filtros">
        <input type="hidden" name="situacao" value={status} />
        <input name="q" defaultValue={filters.q} placeholder="Nome ou nome esportivo" aria-label="Nome" className={`${select} min-w-[14rem]`} />
        <input name="pais" defaultValue={filters.country} placeholder="País (BR)" maxLength={2} aria-label="País" className={`${select} w-24 uppercase`} />
        <select name="posicao" defaultValue={filters.position ?? ""} aria-label="Posição" className={select}>
          <option value="">Todas as posições</option>
          {positions.map((x) => <option key={x} value={x}>{p.positions[x]}</option>)}
        </select>
        <select name="visibilidade" defaultValue={filters.visibility ?? ""} aria-label="Visibilidade" className={select}>
          <option value="">Toda visibilidade</option>
          <option value="active">Ativo</option><option value="paused">Pausado</option><option value="hidden">Oculto</option>
        </select>
        <button className="h-11 border border-white/20 px-4 text-[0.9rem] text-bone hover:border-bone">Filtrar</button>
      </form>
      {rows.length === 0 ? <p className="text-fog">Nenhum atleta com esses filtros.</p> : (
        <ul className="border-t border-white/12">
          {rows.map((a) => (
            <li key={a.id} className="border-b border-white/12">
              <Link href={`${base}/${a.id}`} className="flex flex-col gap-1 py-4 transition-colors hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between sm:px-3">
                <span>
                  <span className="block text-bone">{a.sport_name || a.full_name}</span>
                  <span className="text-[0.85rem] text-ash">
                    {a.full_name} · {ageOn(a.birth_date)} anos · {a.primary_position ? p.positions[a.primary_position] : "posição não informada"}
                    {a.category ? ` · ${a.category}` : ""} · {[a.city, a.state, a.country].filter(Boolean).join(", ")} · {p.visibility[a.visibility]}
                  </span>
                </span>
                <span className="text-[0.8rem] text-ash">{status === "in_review" && a.submitted_at ? `enviado ${fmtDate(a.submitted_at)}` : `atualizado ${fmtDate(a.updated_at)}`}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
