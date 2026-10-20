"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useKeepAction } from "@/components/forms/use-keep-action";
import { createList, deleteList, setInList, toggleFavorite, type PortalState } from "@/lib/portal/actions";
import { TextArea, TextField, ghostButton, primaryButton } from "@/components/panel/controls";
import type { PortalDictionary } from "@/i18n/get-dictionary";

function Heart({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={`size-4 ${on ? "fill-grass text-grass" : "fill-none text-bone"}`} aria-hidden>
      <path d="M8 14s-5.5-3.3-5.5-7.2A3 3 0 0 1 8 5a3 3 0 0 1 5.5 1.8C13.5 10.7 8 14 8 14z" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function FavoriteButton({ lang, athleteId, on, labels, compact = false }: { lang: string; athleteId: string; on: boolean; labels: { on: string; off: string }; compact?: boolean }) {
  const [fav, setFav] = useState(on);
  const [pending, start] = useTransition();
  const router = useRouter();
  const click = () => start(async () => {
    const next = !fav;
    setFav(next);
    const r = await toggleFavorite(lang, athleteId, next);
    if (r?.error) setFav(!next);
    router.refresh();
  });
  return (
    <button type="button" onClick={click} disabled={pending} aria-pressed={fav} aria-label={fav ? labels.on : labels.off}
      className={compact
        ? "grid size-11 place-items-center border border-white/15 bg-ink/60 backdrop-blur transition-colors hover:border-white/50"
        : `${ghostButton} gap-2`}>
      <Heart on={fav} />
      {!compact && <span>{fav ? labels.on : labels.off}</span>}
    </button>
  );
}

export function ListToggles({ lang, athleteId, lists, inLists, t }: {
  lang: string; athleteId: string; lists: { id: string; name: string }[]; inLists: string[]; t: PortalDictionary["profile"];
}) {
  const [sel, setSel] = useState(new Set(inLists));
  const [pending, start] = useTransition();
  if (!lists.length) return <p className="text-[0.85rem] text-ash">{t.noLists}</p>;
  return (
    <ul className="space-y-2">
      {lists.map((l) => {
        const on = sel.has(l.id);
        return (
          <li key={l.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[0.95rem] text-fog">
              <input type="checkbox" checked={on} disabled={pending} className="size-5 accent-[#4f9a6a]"
                onChange={() => {
                  const prev = sel;
                  const next = new Set(sel);
                  if (on) next.delete(l.id); else next.add(l.id);
                  setSel(next);
                  start(async () => {
                    const r = await setInList(lang, l.id, athleteId, !on);
                    if (r?.error) setSel(prev);
                  });
                }} />
              <span>{l.name}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export function InterestForm({ action, t }: { action: (s: PortalState, fd: FormData) => Promise<PortalState>; t: PortalDictionary["interest"] }) {
  const [state, formAction, pending] = useKeepAction(action);
  if (state?.ok) return <p role="status" className="border-l-2 border-grass pl-4 text-bone">{t.sent}</p>;
  const err = state?.error ? (t.errors as Record<string, string>)[state.error] ?? t.errors.generic : null;
  return (
    <form onSubmit={formAction} className="space-y-4">
      <TextArea label={t.message} name="message" required minLength={10} maxLength={500} hint={t.messageHint} />
      {err && <p role="alert" className="border-l-2 border-[#e5a3a3] pl-4 text-[#f0c4c4]">{err}</p>}
      <button disabled={pending} className={`${primaryButton} w-full`}>{t.send}</button>
    </form>
  );
}

export function CreateListForm({ lang, t, error }: { lang: string; t: PortalDictionary["lists"]; error: string }) {
  const [state, formAction, pending] = useKeepAction(createList.bind(null, lang));
  return (
    <form onSubmit={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <TextField label={t.name} name="name" required maxLength={60} className="flex-1" />
      <button disabled={pending} className={primaryButton}>{t.create}</button>
      {state?.error && <p role="alert" className="text-[#f0c4c4]">{error}</p>}
    </form>
  );
}

export function DeleteListButton({ lang, listId, t }: { lang: string; listId: string; t: PortalDictionary["lists"] }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} className={ghostButton}
      onClick={() => confirm(t.confirmDelete) && start(() => deleteList(lang, listId))}>
      {t.delete}
    </button>
  );
}

export function RemoveFromListButton({ lang, listId, athleteId, label }: { lang: string; listId: string; athleteId: string; label: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button type="button" disabled={pending} className="min-h-11 w-full border-t border-white/[0.08] text-[0.85rem] text-fog hover:text-bone"
      onClick={() => start(async () => { await setInList(lang, listId, athleteId, false); router.refresh(); })}>
      {label}
    </button>
  );
}
