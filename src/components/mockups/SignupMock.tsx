"use client";

import { useState } from "react";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Chip, Field, Input, Select, Textarea } from "@/components/ui/Field";

/**
 * Mockup do fluxo de cadastro do responsável. Navegável, sem persistência,
 * sem pagamento e sem integrações — serve apenas para validar a experiência.
 */
export function SignupMock({ dict }: { dict: Dictionary }) {
  const s = dict.signup;
  const f = s.fields;
  const [step, setStep] = useState(2);
  const last = s.steps.length - 1;

  const panels = [
    <Grid key="guardian">
      <Input label={f.guardianName} placeholder="Mariana Andrade" className="sm:col-span-2" />
      <Select label={f.relation} options={["Mãe", "Pai", "Responsável legal"]} />
      <Input label={f.document} placeholder="000.000.000-00" />
      <Input label={f.email} type="email" placeholder="mariana@email.com" />
      <Input label={f.phone} type="tel" placeholder="+55 19 90000-0000" />
      <Select label={f.country} options={["Brasil", "Argentina", "Paraguai", "Uruguai"]} />
    </Grid>,
    <Grid key="verify">
      {[f.codeEmail, f.codePhone].map((label) => (
        <Field key={label} label={label} className="sm:col-span-2">
          <div className="mt-3 flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <input key={i} inputMode="numeric" maxLength={1} defaultValue={i < 3 ? String((i * 3 + 4) % 10) : ""} className="h-14 w-11 border border-white/15 bg-ink/60 text-center font-mono text-xl outline-none focus:border-signal sm:w-14" />
            ))}
          </div>
        </Field>
      ))}
    </Grid>,
    <Grid key="athlete">
      <Input label={f.fullName} defaultValue="Lucas Andrade Moreira" className="sm:col-span-2" />
      <Input label={f.sportName} defaultValue="Lucas Moreira" />
      <Input label={f.birth} type="date" defaultValue="2011-04-18" />
      <Select label={f.nationality} options={["Brasileira", "Argentina", "Paraguaia", "Uruguaia"]} />
      <Select label={f.country} options={["Brasil", "Argentina", "Paraguai", "Uruguai"]} />
      <Input label={f.state} defaultValue="São Paulo" />
      <Input label={f.city} defaultValue="Campinas" />
      <Select label={f.position} options={["Ponta-direita", "Atacante", "Meia", "Volante", "Zagueiro", "Lateral", "Goleiro"]} />
      <Select label={f.position2} options={["Meia ofensivo", "Ponta-esquerda", "Atacante", "—"]} />
      <Field label={f.foot} className="sm:col-span-2">
        <div className="mt-2 flex flex-wrap gap-2">
          {["Destro", "Canhoto", "Ambidestro"].map((o, i) => (
            <Chip key={o} defaultChecked={i === 1}>{o}</Chip>
          ))}
        </div>
      </Field>
      <Input label={f.height} inputMode="numeric" defaultValue="162" />
      <Input label={f.weight} inputMode="numeric" defaultValue="49" />
    </Grid>,
    <Grid key="career">
      <Input label={f.club} defaultValue="EC Horizonte" />
      <Select label={f.category} options={["Sub-14", "Sub-13", "Sub-15", "Sub-17"]} />
      <Field label={f.federated} className="sm:col-span-2">
        <div className="mt-2 flex gap-2"><Chip defaultChecked>Sim</Chip><Chip>Não</Chip></div>
      </Field>
      <Field label={f.previous} className="sm:col-span-2">
        <div className="mt-2 space-y-2">
          {[["Atlético Vale Verde", "2021 — 2023"], ["Escola Nova Geração", "2018 — 2021"]].map(([club, period]) => (
            <div key={club} className="flex items-center justify-between border border-white/10 bg-ink/40 px-4 py-3 text-sm">
              <span>{club}</span>
              <span className="font-mono text-xs text-ash">{period}</span>
            </div>
          ))}
          <button type="button" className="eyebrow h-11 w-full border border-dashed border-white/20 text-fog hover:border-signal hover:text-bone">
            + {f.addClub}
          </button>
        </div>
      </Field>
      <Input label={f.competitions} defaultValue="Paulista Sub-14, Copa Interior" className="sm:col-span-2" />
      <Textarea label={f.achievements} defaultValue="Campeão Copa Interior Sub-13 (2024)" className="sm:col-span-2" />
      <Field label={f.traits} className="sm:col-span-2">
        <div className="mt-2 flex flex-wrap gap-2">
          {["Drible curto", "Aceleração", "Leitura de jogo", "Cabeceio", "Finalização", "Bola parada", "Marcação"].map((t, i) => (
            <Chip key={t} defaultChecked={[0, 1, 2, 5].includes(i)}>{t}</Chip>
          ))}
        </div>
      </Field>
      <Textarea label={f.goals} defaultValue="Seguir evoluindo em categoria de base estruturada." className="sm:col-span-2" />
      <Field label={f.seeking} className="sm:col-span-2">
        <div className="mt-2 flex flex-wrap gap-2">
          {s.seekingOptions.map((o, i) => (
            <Chip key={o} defaultChecked={[0, 1, 4].includes(i)}>{o}</Chip>
          ))}
        </div>
      </Field>
    </Grid>,
    <Grid key="media">
      <Field label={f.mainPhoto} className="sm:col-span-2">
        <div className="mt-2 grid aspect-[16/7] place-items-center border border-dashed border-white/20 bg-ink/40 text-center text-sm text-ash transition-colors hover:border-signal">
          <span><span className="mb-2 block text-2xl text-bone">+</span>{f.upload}<br /><span className="font-mono text-[0.65rem]">JPG · PNG · WEBP · até 8 MB</span></span>
        </div>
      </Field>
      <Field label={f.extraPhotos} className="sm:col-span-2">
        <div className="mt-2 grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="grid aspect-square place-items-center border border-dashed border-white/15 bg-ink/40 text-ash">+</div>
          ))}
        </div>
      </Field>
      <Input label={f.youtube} type="url" defaultValue="https://youtube.com/watch?v=exemplo" className="sm:col-span-2" />
      <Input label={f.extraVideos} type="url" placeholder="https://youtube.com/…" className="sm:col-span-2" />
    </Grid>,
    <div key="consent" className="space-y-3">
      {s.consents.map((c, i) => (
        <label key={c} className="flex cursor-pointer gap-4 border border-white/10 bg-ink/40 p-4 text-sm leading-relaxed text-fog has-[:checked]:border-signal/50 has-[:checked]:text-bone">
          <input type="checkbox" defaultChecked={i < 3} className="mt-1 size-4 shrink-0 accent-[var(--color-signal)]" />
          {c}
        </label>
      ))}
    </div>,
    <div key="payment" className="space-y-3">
      {["Pix", "Cartão de crédito"].map((m, i) => (
        <label key={m} className="flex cursor-pointer items-center justify-between border border-white/10 bg-ink/40 p-5 has-[:checked]:border-signal">
          <span className="flex items-center gap-4">
            <input type="radio" name="pay" defaultChecked={i === 0} className="size-4 accent-[var(--color-signal)]" />
            {m}
          </span>
          <span className="font-mono text-sm">R$ 59,90</span>
        </label>
      ))}
      <p className="eyebrow pt-2 normal-case tracking-[0.06em]">{s.secure}</p>
    </div>,
    <div key="status">
      <h3 className="eyebrow mb-6 text-bone">{s.status.title}</h3>
      <ol className="relative space-y-7 border-l border-white/10 pl-8">
        {s.status.items.map((it) => (
          <li key={it.label} className="relative">
            <span
              className={`absolute -left-[2.3rem] top-1 grid size-3.5 place-items-center rounded-full border ${
                it.state === "done" ? "border-bone bg-bone" : it.state === "current" ? "border-signal bg-signal shadow-[0_0_0_6px_rgba(255,91,35,0.18)]" : "border-white/25 bg-ink"
              }`}
            />
            <p className={it.state === "todo" ? "text-ash" : "text-bone"}>{it.label}</p>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-sm text-fog">{s.status.note}</p>
    </div>,
  ];

  return (
    <div className="gutter grid grid-cols-1 gap-8 py-10 md:py-16 lg:grid-cols-12 lg:gap-10 [&>*]:min-w-0">
      {/* Stepper */}
      <nav aria-label={s.title} className="lg:col-span-3">
        <p className="eyebrow">{s.sub}</p>
        <h1 className="display mt-3 text-4xl md:text-5xl">{s.title}</h1>
        <ol className="-mx-4 mt-8 flex gap-1 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:px-0">
          {s.steps.map((name, i) => (
            <li key={name} className="shrink-0">
              <button
                type="button"
                onClick={() => setStep(i)}
                aria-current={i === step ? "step" : undefined}
                className={`flex w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left text-sm transition-colors lg:py-3 ${
                  i === step ? "border-signal bg-white/[0.04] text-bone" : i < step ? "border-white/30 text-fog" : "border-white/10 text-ash hover:text-fog"
                }`}
              >
                <span className="font-mono text-[0.7rem]">{String(i + 1).padStart(2, "0")}</span>
                {name}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {/* Painel */}
      <section className="border border-white/10 bg-graphite p-6 md:p-10 lg:col-span-6">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="display text-2xl md:text-3xl">{s.steps[step]}</h2>
          <span className="font-mono text-xs text-ash">{step + 1} / {s.steps.length}</span>
        </div>
        <div className="mb-8 h-px bg-white/10">
          <div className="h-px bg-signal transition-[width] duration-700 ease-[var(--ease-cine)]" style={{ width: `${((step + 1) / s.steps.length) * 100}%` }} />
        </div>
        {panels[step]}
        <div className="mt-10 flex justify-between gap-4 border-t border-white/10 pt-6">
          <button type="button" disabled={step === 0} onClick={() => setStep((v) => Math.max(0, v - 1))} className="eyebrow h-12 px-2 text-fog disabled:opacity-30">
            ← {s.prev}
          </button>
          <button type="button" disabled={step === last} onClick={() => setStep((v) => Math.min(last, v + 1))} className="h-12 bg-bone px-7 font-mono text-[0.72rem] uppercase tracking-[0.2em] text-ink transition-colors hover:bg-signal disabled:opacity-30">
            {s.next} →
          </button>
        </div>
      </section>

      {/* Resumo */}
      <aside className="h-fit border border-white/10 p-6 lg:sticky lg:top-24 lg:col-span-3">
        <p className="eyebrow">{s.summary}</p>
        <div className="mt-6 flex items-baseline justify-between gap-4 border-b border-white/10 pb-4 text-sm">
          <span>{s.summaryItem}</span>
          <span className="font-mono">R$ 59,90</span>
        </div>
        <div className="mt-4 flex items-baseline justify-between">
          <span className="eyebrow text-bone">{s.total}</span>
          <span className="display text-3xl">R$ 59,90</span>
        </div>
        <p className="mt-6 text-xs leading-relaxed text-ash">{dict.pricing.disclaimer}</p>
      </aside>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-5 sm:grid-cols-2">{children}</div>;
}
