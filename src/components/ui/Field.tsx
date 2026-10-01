import type { ComponentProps, ReactNode } from "react";

const control =
  "mt-2 h-12 w-full border border-white/12 bg-ink/60 px-4 text-[0.95rem] text-bone placeholder:text-white/25 outline-none transition-colors focus:border-signal";

export function Field({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  );
}

export function Input({ label, className, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <Field label={label} className={className}>
      <input className={control} {...props} />
    </Field>
  );
}

export function Select({ label, options, className }: { label: string; options: string[]; className?: string }) {
  return (
    <Field label={label} className={className}>
      <select className={`${control} appearance-none bg-[linear-gradient(45deg,transparent_50%,#8b8b93_50%),linear-gradient(135deg,#8b8b93_50%,transparent_50%)] bg-[length:5px_5px] bg-[position:calc(100%-22px)_50%,calc(100%-17px)_50%] bg-no-repeat`} defaultValue={options[0]}>
        {options.map((o) => (
          <option key={o} className="bg-graphite">{o}</option>
        ))}
      </select>
    </Field>
  );
}

export function Textarea({ label, className, ...props }: ComponentProps<"textarea"> & { label: string }) {
  return (
    <Field label={label} className={className}>
      <textarea className={`${control} h-28 resize-none py-3`} {...props} />
    </Field>
  );
}

/** Opção selecionável (checkbox estilizado como chip). */
export function Chip({ children, defaultChecked }: { children: ReactNode; defaultChecked?: boolean }) {
  return (
    <label className="cursor-pointer">
      <input type="checkbox" defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="inline-flex h-10 items-center border border-white/15 px-4 text-sm text-fog transition-colors peer-checked:border-signal peer-checked:bg-signal/10 peer-checked:text-bone peer-focus-visible:outline-2 peer-focus-visible:outline-signal hover:border-white/40">
        {children}
      </span>
    </label>
  );
}
