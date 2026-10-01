import type { ComponentProps, ReactNode } from "react";

/**
 * Campos do painel: mesma linguagem do site (filetes, sem cantos arredondados),
 * nomes de campo reais (Server Actions) e alvos ≥ 44px.
 */
export const control =
  "mt-2 h-12 w-full border border-white/12 bg-ink/60 px-4 text-[0.95rem] text-bone placeholder:text-white/25 outline-none transition-colors focus:border-grass disabled:opacity-50";

export function Label({ text, hint, optional, children, className = "" }: { text: string; hint?: string; optional?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block">
        <span className="eyebrow text-fog">
          {text}
          {optional && <span className="text-ash"> · {optional}</span>}
        </span>
        {children}
      </label>
      {hint && <p className="mt-1.5 text-[0.8rem] leading-snug text-ash">{hint}</p>}
    </div>
  );
}

export function TextField({ label, hint, optional, className, ...props }: ComponentProps<"input"> & { label: string; hint?: string; optional?: string }) {
  return (
    <Label text={label} hint={hint} optional={optional} className={className}>
      <input className={control} {...props} />
    </Label>
  );
}

export function TextArea({ label, hint, optional, className, ...props }: ComponentProps<"textarea"> & { label: string; hint?: string; optional?: string }) {
  return (
    <Label text={label} hint={hint} optional={optional} className={className}>
      <textarea className={`${control} h-32 resize-y py-3 leading-relaxed`} {...props} />
    </Label>
  );
}

const arrow =
  "appearance-none bg-[linear-gradient(45deg,transparent_50%,#87918b_50%),linear-gradient(135deg,#87918b_50%,transparent_50%)] bg-[length:5px_5px] bg-[position:calc(100%-22px)_50%,calc(100%-17px)_50%] bg-no-repeat pr-10";

export function SelectField({
  label, name, options, defaultValue, placeholder, hint, optional, className, required,
}: {
  label: string; name: string; options: { value: string; label: string }[]; defaultValue?: string | null;
  placeholder?: string; hint?: string; optional?: string; className?: string; required?: boolean;
}) {
  return (
    <Label text={label} hint={hint} optional={optional} className={className}>
      <select name={name} defaultValue={defaultValue ?? ""} required={required} className={`${control} ${arrow}`}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-graphite">{o.label}</option>
        ))}
      </select>
    </Label>
  );
}

/** Grupo de opções em "chips" (radio = uma; checkbox = várias). */
export function Choices({
  legend, name, options, value, multiple = false, hint, className = "",
}: {
  legend: string; name: string; options: { value: string; label: string }[]; value?: string | string[] | null;
  multiple?: boolean; hint?: string; className?: string;
}) {
  const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);
  return (
    <fieldset className={className}>
      <legend className="eyebrow text-fog">{legend}</legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input type={multiple ? "checkbox" : "radio"} name={name} value={o.value} defaultChecked={selected.has(o.value)} className="peer sr-only" />
            <span className="inline-flex min-h-11 items-center border border-white/15 px-4 text-[0.9rem] text-fog transition-colors peer-checked:border-grass peer-checked:bg-grass/15 peer-checked:text-bone peer-focus-visible:outline-2 peer-focus-visible:outline-grass hover:border-white/40">
              {o.label}
            </span>
          </label>
        ))}
      </div>
      {hint && <p className="mt-2 text-[0.8rem] leading-snug text-ash">{hint}</p>}
    </fieldset>
  );
}

/** Título de bloco do painel: filete + título condensado. */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 border-t border-white/12 pt-5">
      <h2 className="font-display text-[1.6rem] font-extrabold uppercase leading-none [font-stretch:62%] md:text-[2rem]">{children}</h2>
      {aside}
    </div>
  );
}

/** Botão primário editorial (mesma linguagem do CTA do Hero). */
export const primaryButton =
  "group relative inline-flex h-14 items-center justify-center overflow-hidden bg-bone px-7 font-display text-[1.15rem] font-extrabold uppercase tracking-[0.03em] text-ink [font-stretch:62%] transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-grass disabled:opacity-60 hover:bg-[#dfe9e2]";
export const ghostButton =
  "inline-flex h-12 items-center justify-center border border-white/20 px-5 text-[0.9rem] font-medium text-bone transition-colors hover:border-bone focus-visible:outline-2 focus-visible:outline-grass disabled:opacity-50";
export const textButton = "text-[0.875rem] font-medium text-fog underline-offset-4 transition-colors hover:text-bone hover:underline";
