"use client";

import { useActionState, useState } from "react";
import type { PanelDictionary } from "@/i18n/get-dictionary";
import type { FormState } from "@/lib/panel/actions";
import { Label, control, primaryButton } from "@/components/panel/controls";

type Video = { id: string; title: string | null; thumb: string; type: string | null };
const aiTypes = ["highlights", "full_match", "training"] as const;
type AiType = (typeof aiTypes)[number];
const toAiType = (t: string | null): AiType => (aiTypes.includes(t as AiType) ? (t as AiType) : "highlights");

/**
 * Pedido de avaliação por IA (pensado para o celular): escolher UM vídeo,
 * confirmar tipo, duração, camisa, uniforme e posição, e autorizar.
 */
export function AiRequestForm({
  action, videos, t, positions, defaultPosition, defaultShirt,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  videos: Video[];
  t: PanelDictionary["ai"];
  positions: { value: string; label: string }[];
  defaultPosition: string | null;
  defaultShirt?: number | null;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [media, setMedia] = useState(videos[0]?.id ?? "");
  const [type, setType] = useState<AiType>(toAiType(videos[0]?.type ?? null));
  const pick = (v: Video) => {
    setMedia(v.id);
    setType(toAiType(v.type));
  };
  const error = state?.error ? t.errors[state.error as keyof typeof t.errors] ?? t.errors.generic : null;

  return (
    <form action={formAction} className="space-y-10">
      <fieldset>
        <legend className="max-w-[56ch] text-[1.1rem] leading-snug text-bone">{t.question}</legend>
        <p className="mt-2 text-[0.85rem] leading-snug text-ash">{t.publicNote}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {videos.map((v) => (
            <label key={v.id} className="group flex cursor-pointer items-center gap-4 border border-white/15 p-2 pr-4 transition-colors has-[:checked]:border-grass has-[:checked]:bg-grass/10 hover:border-white/40">
              <input type="radio" name="media_id" value={v.id} checked={media === v.id} onChange={() => pick(v)} className="sr-only" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.thumb} alt="" loading="lazy" className="aspect-video w-28 shrink-0 object-cover" />
              <span className="min-w-0">
                <span className="block truncate text-[0.95rem] text-bone">{v.title || "YouTube"}</span>
                {v.type && <span className="text-[0.8rem] text-ash">{t.videoTypes[toAiType(v.type)]}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="eyebrow text-fog">{t.videoType}</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {aiTypes.map((v) => (
            <label key={v} className="cursor-pointer">
              <input type="radio" name="video_type" value={v} checked={type === v} onChange={() => setType(v)} className="peer sr-only" />
              <span className="inline-flex min-h-11 items-center border border-white/15 px-4 text-[0.9rem] text-fog transition-colors peer-checked:border-grass peer-checked:bg-grass/15 peer-checked:text-bone peer-focus-visible:outline-2 peer-focus-visible:outline-grass">
                {t.videoTypes[v]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-6 sm:grid-cols-3">
        <Label text={t.minutes} hint={t.minutesHint}>
          <input name="video_minutes" type="number" inputMode="numeric" min={1} max={130} required className={control} defaultValue={type === "full_match" ? 90 : undefined} key={type} />
        </Label>
        <Label text={t.shirtNumber}>
          <input name="shirt_number" type="number" inputMode="numeric" min={0} max={99} required defaultValue={defaultShirt ?? undefined} className={control} />
        </Label>
        <Label text={t.shirtColor} hint={t.shirtColorHint}>
          <input name="shirt_color" required minLength={2} maxLength={40} className={control} />
        </Label>
      </div>

      {type === "full_match" && (
        <fieldset>
          <legend className="eyebrow text-fog">{t.rangeTitle}</legend>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:max-w-md">
            <Label text={t.rangeFrom}><input name="range_from" type="number" inputMode="numeric" min={0} max={129} className={control} /></Label>
            <Label text={t.rangeTo}><input name="range_to" type="number" inputMode="numeric" min={1} max={130} className={control} /></Label>
          </div>
          <p className="mt-2 text-[0.8rem] text-ash">{t.rangeHint}</p>
        </fieldset>
      )}

      <Label text={t.position} className="sm:max-w-sm">
        <select name="position" required defaultValue={defaultPosition ?? ""} className={control}>
          <option value="" disabled>—</option>
          {positions.map((p) => (
            <option key={p.value} value={p.value} className="bg-graphite">{p.label}</option>
          ))}
        </select>
      </Label>

      <section className="space-y-4 border border-white/15 p-5 md:p-6">
        <h3 className="font-display text-[1.4rem] font-extrabold uppercase leading-none [font-stretch:62%]">{t.consentTitle}</h3>
        <p className="text-[0.9rem] leading-relaxed text-fog">{t.consentText}</p>
        <label className="flex min-h-12 cursor-pointer items-center gap-3 text-[0.95rem] text-bone">
          <input type="checkbox" name="consent" value="yes" required className="size-5 shrink-0 accent-[#4f9a6a]" />
          {t.consentCheck}
        </label>
      </section>

      <div className="space-y-4">
        <p className="text-[0.85rem] leading-snug text-ash">{t.paymentNote}</p>
        {error && <p role="alert" className="border-l-2 border-[#e5a3a3] pl-4 text-[#f0c4c4]">{error}</p>}
        <button disabled={pending || !media} className={`${primaryButton} w-full sm:w-auto sm:min-w-[18rem]`}>{t.submit}</button>
      </div>
    </form>
  );
}
