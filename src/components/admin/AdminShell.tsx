import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { signOut } from "@/lib/auth/actions";

const nav = [
  { href: "", label: "Visão geral" },
  { href: "/atletas", label: "Atletas" },
  { href: "/organizacoes", label: "Organizações" },
];

/** Moldura da área administrativa (interna, em português). */
export function AdminShell({ lang, name, env, children }: { lang: string; name?: string; env: string | null; children: React.ReactNode }) {
  const base = `/${lang}/admin`;
  return (
    <div className="min-h-svh bg-ink">
      {env && (
        <p className="bg-turf px-4 py-1.5 text-center text-[0.78rem] font-medium uppercase tracking-[0.12em] text-bone">
          Ambiente de {env === "homolog" ? "homologação — dados fictícios" : env}
        </p>
      )}
      <header className="gutter sticky top-0 z-40 border-b border-white/[0.08] bg-ink/85 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between">
          <Link href={base} aria-label="Administração" className="flex items-center gap-3 text-bone">
            <Logo variant="editorial" />
            <span className="border-l border-white/20 pl-3 text-[0.8rem] uppercase tracking-[0.12em] text-fog">Admin</span>
          </Link>
          <div className="flex items-center gap-5">
            {name && <span className="hidden text-[0.875rem] text-fog md:inline">{name}</span>}
            {name && (
              <form action={signOut.bind(null, lang)}>
                <button className="text-[0.875rem] font-medium text-fog transition-colors hover:text-bone">Sair</button>
              </form>
            )}
          </div>
        </div>
        <nav aria-label="Seções" className="-mb-px flex gap-6 overflow-x-auto text-[0.9rem]">
          {nav.map((n) => (
            <Link key={n.href} href={`${base}${n.href}`} className="whitespace-nowrap border-b-2 border-transparent pb-3 text-fog transition-colors hover:border-white/30 hover:text-bone">
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
