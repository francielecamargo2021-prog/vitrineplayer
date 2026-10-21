import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { requireAdmin, searchAll } from "@/lib/admin/data";
import { AdminTitle, SearchBox } from "@/components/admin/AdminUi";

const kindLabel = { athlete: "Atleta", account: "Conta", organization: "Organização" } as const;
const hrefFor = { athlete: "atletas", account: "contas", organization: "organizacoes" } as const;

export default async function AdminSearch({ params, searchParams }: PageProps<"/[lang]/admin/busca">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireAdmin(lang);
  if (!session) return null;
  const term = String((await searchParams).q ?? "").slice(0, 80);
  const hits = await searchAll(session, term);
  return (
    <main className="gutter mx-auto max-w-5xl space-y-8 py-12 md:py-16">
      <AdminTitle>Busca</AdminTitle>
      <SearchBox action={`/${lang}/admin/busca`} value={term} placeholder="Nome, e-mail ou documento (mínimo 2 letras)" />
      {term.length >= 2 && (hits.length === 0 ? <p className="text-fog">Nada encontrado.</p> : (
        <ul className="border-t border-white/12" data-testid="admin-busca">
          {hits.map((h) => (
            <li key={h.kind + h.id} className="border-b border-white/12">
              <Link href={`/${lang}/admin/${hrefFor[h.kind]}/${h.id}`} className="flex flex-col gap-1 py-4 hover:bg-white/[0.03] sm:flex-row sm:justify-between sm:px-3">
                <span className="text-bone">{h.title}</span>
                <span className="text-[0.85rem] text-ash">{kindLabel[h.kind]} · {h.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      ))}
    </main>
  );
}
