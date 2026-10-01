"use client";

import { useState } from "react";
import { control } from "./controls";

type Col = { name: string; label: string; type?: string; placeholder?: string; className?: string };

/** Linhas repetíveis (clubes anteriores, conquistas) enviadas como arrays no FormData. */
export function Repeatable({ legend, cols, rows: initial, addLabel, removeLabel, max = 20 }: {
  legend: string; cols: Col[]; rows: Record<string, string>[]; addLabel: string; removeLabel: string; max?: number;
}) {
  const [rows, setRows] = useState<{ key: number; data: Record<string, string> }[]>(() => initial.map((data, key) => ({ key, data })));
  const [seq, setSeq] = useState(initial.length);
  return (
    <fieldset>
      <legend className="eyebrow text-fog">{legend}</legend>
      <ul className="mt-3 space-y-3">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-2 gap-2 border-l border-white/15 pl-3 sm:grid-cols-[repeat(var(--n),minmax(0,1fr))_auto] sm:items-end" style={{ "--n": cols.length } as React.CSSProperties}>
            {cols.map((c) => (
              <label key={c.name} className={c.className}>
                <span className="text-[0.75rem] text-ash">{c.label}</span>
                <input name={c.name} type={c.type ?? "text"} defaultValue={r.data[c.name] ?? ""} placeholder={c.placeholder} className={`${control} mt-1`} />
              </label>
            ))}
            <button type="button" onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} className="col-span-2 h-11 text-left text-[0.85rem] text-ash hover:text-bone sm:col-span-1 sm:text-center">
              {removeLabel}
            </button>
          </li>
        ))}
      </ul>
      {rows.length < max && (
        <button type="button" onClick={() => { setRows((x) => [...x, { key: seq, data: {} }]); setSeq(seq + 1); }} className="mt-3 inline-flex h-11 items-center border border-dashed border-white/25 px-4 text-[0.9rem] text-fog hover:border-white/60 hover:text-bone">
          + {addLabel}
        </button>
      )}
    </fieldset>
  );
}
