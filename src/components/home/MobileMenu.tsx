"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Menu do celular/tablet: painel em tela cheia, fecha ao escolher um link ou com Esc. */
export function MobileMenu({
  links, signup, pro, labels,
}: {
  links: { href: string; label: string }[];
  signup: { href: string; label: string };
  pro: { href: string; label: string };
  labels: { open: string; close: string };
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="menu-movel"
        aria-label={open ? labels.close : labels.open}
        onClick={() => setOpen((v) => !v)}
        className="relative z-[60] flex size-11 items-center justify-center text-bone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-grass"
      >
        <span aria-hidden className="relative block h-3.5 w-6">
          <span className={`absolute left-0 h-[2px] w-6 bg-current transition-transform duration-500 ${open ? "top-1.5 rotate-45" : "top-0"}`} />
          <span className={`absolute left-0 h-[2px] w-6 bg-current transition-transform duration-500 ${open ? "top-1.5 -rotate-45" : "top-3"}`} />
        </span>
      </button>
      <div
        id="menu-movel"
        hidden={!open}
        className="fixed inset-0 z-[55] flex flex-col bg-ink/[0.97] px-[max(1.25rem,env(safe-area-inset-left))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-24 backdrop-blur-xl"
      >
        <nav className="flex flex-col border-t border-white/10">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="t-display border-b border-white/10 py-4 text-[2.1rem] text-bone transition-colors hover:text-grass">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="mt-auto grid gap-3">
          <Link href={signup.href} onClick={() => setOpen(false)} className="flex h-14 items-center justify-center bg-bone font-semibold text-ink">{signup.label}</Link>
          <Link href={pro.href} onClick={() => setOpen(false)} className="flex h-14 items-center justify-center border border-white/25 font-semibold text-bone">{pro.label}</Link>
        </div>
      </div>
    </div>
  );
}
