import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { adminCounts, requireAdmin } from "@/lib/admin/data";
import { AdminTitle, SearchBox } from "@/components/admin/AdminUi";

export default async function AdminHome({ params }: PageProps<"/[lang]/admin">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireAdmin(lang);
  if (!session) return null;
  const c = await adminCounts(session);
  const tiles = [
    { n: c.inReview, label: "Atletas aguardando revisão", href: "/atletas?situacao=in_review", urgent: c.inReview > 0 },
    { n: c.orgsPending, label: "Organizações aguardando verificação", href: "/organizacoes?situacao=pending", urgent: c.orgsPending > 0 },
    { n: c.reportsOpen, label: "Denúncias abertas", href: "/denuncias", urgent: c.reportsOpen > 0 },
    { n: c.interestsOpen, label: "Interesses aguardando a família", href: "/interesses?situacao=requested" },
    { n: c.approved, label: "Atletas aprovados", href: "/atletas?situacao=approved" },
    { n: c.orgsApproved, label: "Organizações aprovadas", href: "/organizacoes?situacao=approved" },
    { n: c.correctionsOpen, label: "Correções pedidas em aberto", href: "/auditoria?acao=athlete.correction" },
    { n: c.suspendedAccounts, label: "Contas suspensas", href: "/contas?suspensas=1" },
    { n: c.aiQueued, label: "Análises de IA na fila (IA desligada)", href: "/ia" },
    { n: c.outbox, label: "Avisos aguardando envio", href: "/avisos" },
  ];
  return (
    <main className="gutter mx-auto max-w-6xl space-y-10 py-12 md:py-16">
      <AdminTitle>Visão geral</AdminTitle>
      <SearchBox action={`/${lang}/admin/busca`} placeholder="Buscar atleta, conta (nome ou e-mail) ou organização (nome ou documento)" />
      <ul className="grid gap-px border-y border-white/12 bg-white/12 sm:grid-cols-2" data-testid="admin-contadores">
        {tiles.map((t) => (
          <li key={t.label} className="bg-ink">
            <Link href={`/${lang}/admin${t.href}`} className="block py-7 transition-colors hover:bg-white/[0.03] sm:px-6">
              <span className={`font-display text-[4rem] font-black leading-none [font-stretch:62%] ${t.urgent ? "text-bone" : "text-fog"}`}>{t.n}</span>
              <span className="mt-2 flex items-center gap-2 text-[0.95rem] text-fog">{t.urgent && <span aria-hidden className="size-2 bg-grass" />}{t.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
