import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { listAccounts, requireAdmin } from "@/lib/admin/data";
import { AdminTitle, Pills, SearchBox, fmtDate } from "@/components/admin/AdminUi";

const roles = [
  { key: "RESPONSIBLE", label: "Responsáveis" },
  { key: "PROFESSIONAL", label: "Profissionais" },
  { key: "ADMIN", label: "Administradores" },
] as const;

export default async function AdminAccounts({ params, searchParams }: PageProps<"/[lang]/admin/contas">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireAdmin(lang);
  if (!session) return null;
  const sp = await searchParams;
  const role = roles.find((r) => r.key === sp.papel)?.key ?? "RESPONSIBLE";
  const suspended = sp.suspensas === "1";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : undefined;
  const rows = await listAccounts(session, { role, suspended, q });
  const base = `/${lang}/admin/contas`;
  return (
    <main className="gutter mx-auto max-w-6xl space-y-8 py-12 md:py-16">
      <AdminTitle lead="Contato de responsáveis e profissionais é visível só aqui, para administradores.">Contas</AdminTitle>
      <Pills label="Tipo de conta" items={[
        ...roles.map((r) => ({ href: `${base}?papel=${r.key}`, label: r.label, current: r.key === role && !suspended })),
        { href: `${base}?papel=${role}&suspensas=1`, label: "Suspensas", current: suspended },
      ]} />
      <SearchBox action={base} value={q} placeholder="Nome ou e-mail" hidden={{ papel: role }} />
      {rows.length === 0 ? <p className="text-fog">Nenhuma conta encontrada.</p> : (
        <ul className="border-t border-white/12" data-testid="lista-contas">
          {rows.map((c) => (
            <li key={c.id} className="border-b border-white/12">
              <Link href={`${base}/${c.id}`} className="flex flex-col gap-1 py-4 hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between sm:px-3">
                <span>
                  <span className="block text-bone">{c.full_name}{c.suspended_at ? <span className="ml-2 text-[0.8rem] text-[#f0c4c4]">suspensa</span> : null}</span>
                  <span className="text-[0.85rem] text-ash">{c.email}{c.country ? ` · ${c.country}` : ""}{role === "RESPONSIBLE" ? ` · ${c.athletes} atleta(s)` : c.org ? ` · ${c.org}` : ""}</span>
                </span>
                <span className="text-[0.8rem] text-ash">desde {fmtDate(c.created_at, false)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
