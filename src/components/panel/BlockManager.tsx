"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PanelDictionary } from "@/i18n/get-dictionary";
import { blockOrganization, searchOrganizations, unblockOrganization } from "@/lib/panel/actions";
import { control } from "./controls";

type Org = { id: string; name: string; kind: keyof PanelDictionary["privacy"]["kinds"]; country: string };

/** "Ocultar meu perfil para": busca organizações aprovadas e mantém a lista do atleta. */
export function BlockManager({ lang, athleteId, blocked, t }: { lang: string; athleteId: string; blocked: Org[]; t: PanelDictionary["privacy"] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Org[] | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (q.trim().length < 3) return;
    const id = setTimeout(() => searchOrganizations(q).then((r) => setResults(r as Org[])), 250);
    return () => clearTimeout(id);
  }, [q]);

  const blockedIds = new Set(blocked.map((b) => b.id));
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });
  const shown = q.trim().length >= 3 ? results : null;

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div>
        <label className="block">
          <span className="eyebrow text-fog">{t.search}</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} className={control} placeholder="…" autoComplete="off" />
        </label>
        <p className="mt-1.5 text-[0.8rem] text-ash">{t.searchHint}</p>
        {shown && (
          <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
            {shown.length === 0 && <li className="py-4 text-ash">{t.noResults}</li>}
            {shown.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-4 py-3">
                <span>
                  <span className="block text-bone">{o.name}</span>
                  <span className="text-[0.8rem] text-ash">{t.kinds[o.kind]} · {o.country}</span>
                </span>
                <button type="button" disabled={pending || blockedIds.has(o.id)} onClick={() => run(() => blockOrganization(lang, athleteId, o.id))} className="h-11 shrink-0 border border-white/20 px-4 text-[0.875rem] hover:border-bone disabled:opacity-40">
                  {t.add}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="eyebrow text-fog">{t.title}</p>
        {blocked.length === 0 ? (
          <p className="mt-3 text-ash">{t.empty}</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/10 border-y border-white/10">
            {blocked.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-4 py-3">
                <span>
                  <span className="block text-bone">{o.name}</span>
                  <span className="text-[0.8rem] text-ash">{t.kinds[o.kind]} · {o.country}</span>
                </span>
                <button type="button" disabled={pending} onClick={() => run(() => unblockOrganization(lang, athleteId, o.id))} className="h-11 shrink-0 px-2 text-[0.875rem] text-ash hover:text-bone">
                  {t.remove}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
