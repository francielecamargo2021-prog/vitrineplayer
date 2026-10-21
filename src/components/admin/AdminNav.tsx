"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "", label: "Visão geral" },
  { href: "/atletas", label: "Atletas" },
  { href: "/contas", label: "Contas" },
  { href: "/organizacoes", label: "Organizações" },
  { href: "/denuncias", label: "Denúncias" },
  { href: "/interesses", label: "Interesses" },
  { href: "/ia", label: "IA" },
  { href: "/configuracoes", label: "Configurações" },
  { href: "/avisos", label: "Avisos" },
  { href: "/auditoria", label: "Auditoria" },
];

/** Menu do admin com a seção atual marcada. */
export function AdminNav({ base }: { base: string }) {
  const path = usePathname();
  return (
    <nav aria-label="Seções" className="-mb-px flex gap-6 overflow-x-auto text-[0.9rem]">
      {nav.map((n) => {
        const full = base + n.href;
        const current = n.href === "" ? path === base || path.startsWith(`${base}/busca`) : path.startsWith(full);
        return (
          <Link key={n.href} href={full} aria-current={current ? "page" : undefined}
            className="whitespace-nowrap border-b-2 border-transparent pb-3 text-fog transition-colors hover:border-white/30 hover:text-bone aria-[current=page]:border-grass aria-[current=page]:text-bone">
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
