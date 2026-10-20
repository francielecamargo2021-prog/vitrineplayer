import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { adminCounts, requireAdmin } from "@/lib/admin/data";

export default async function AdminHome({ params }: PageProps<"/[lang]/admin">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireAdmin(lang);
  if (!session) return null;
  const c = await adminCounts(session.db);
  const tiles = [
    { n: c.inReview, label: "Atletas aguardando revisão", href: "/atletas?situacao=in_review", urgent: c.inReview > 0 },
    { n: c.orgsPending, label: "Organizações aguardando verificação", href: "/organizacoes?situacao=pending", urgent: c.orgsPending > 0 },
    { n: c.approved, label: "Atletas aprovados", href: "/atletas?situacao=approved" },
    { n: c.orgsApproved, label: "Organizações aprovadas", href: "/organizacoes?situacao=approved" },
  ];
  return (
    <main className="gutter mx-auto max-w-6xl py-12 md:py-16">
      <h1 className="font-display text-[clamp(2.6rem,10vw,5.5rem)] font-black uppercase leading-[0.85] [font-stretch:62%]">Visão geral</h1>
      <ul className="mt-10 grid gap-px border-y border-white/12 bg-white/12 sm:grid-cols-2">
        {tiles.map((t) => (
          <li key={t.label} className="bg-ink">
            <Link href={`/${lang}/admin${t.href}`} className="block py-7 transition-colors hover:bg-white/[0.03] sm:px-6">
              <span className={`font-display text-[4rem] font-black leading-none [font-stretch:62%] ${t.urgent ? "text-bone" : "text-fog"}`}>{t.n}</span>
              <span className="mt-2 flex items-center gap-2 text-[0.95rem] text-fog">
                {t.urgent && <span aria-hidden className="size-2 bg-grass" />}{t.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 max-w-[62ch] text-[0.85rem] leading-relaxed text-ash">
        Assinaturas, análises por IA, suporte e pedidos de contato entram nesta área nas próximas etapas.
      </p>
    </main>
  );
}
