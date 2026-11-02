"use client";

import { useState } from "react";
import { useKeepAction } from "@/components/forms/use-keep-action";
import type { PanelDictionary } from "@/i18n/get-dictionary";
import type { FormState } from "@/lib/panel/actions";
import { Label, control, primaryButton } from "@/components/panel/controls";

type Video = { id: string; label: string };

/** Pedido de análise PitchVision: escolher UM vídeo enviado, camisa, uniforme, posição e autorizar. */
export function PvRequestForm({
  action, videos, t, positions, defaultPosition,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  videos: Video[];
  t: PanelDictionary["pv"]["request"];
  positions: { value: string; label: string }[];
  defaultPosition: string | null;
}) {
  const [state, formAction, pending] = useKeepAction(action);
  const [video, setVideo] = useState(videos[0]?.id ?? "");
  const error = state?.error ? t.errors[state.error as keyof typeof t.errors] ?? t.errors.generic : null;

  return (
    <form onSubmit={formAction} className="space-y-10" data-testid="pv-request">
      <fieldset>
        <legend className="eyebrow text-fog">{t.video}</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {videos.map((v) => (
            <label key={v.id} className="flex min-h-12 cursor-pointer items-center border border-white/15 px-4 text-[0.95rem] text-fog transition-colors has-[:checked]:border-grass has-[:checked]:bg-grass/10 has-[:checked]:text-bone hover:border-white/40">
              <input type="radio" name="video_id" value={v.id} checked={video === v.id} onChange={() => setVideo(v.id)} className="sr-only" />
              {v.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-6 sm:grid-cols-3">
        <Label text={t.shirtNumber}>
          <input name="shirt_number" type="number" inputMode="numeric" min={0} max={99} required className={control} />
        </Label>
        <Label text={t.shirtColor} hint={t.shirtColorHint}>
          <input name="shirt_color" maxLength={40} className={control} />
        </Label>
        <Label text={t.position}>
          <select name="position" required defaultValue={defaultPosition ?? ""} className={control}>
            <option value="" disabled>—</option>
            {positions.map((p) => <option key={p.value} value={p.value} className="bg-graphite">{p.label}</option>)}
          </select>
        </Label>
      </div>
      <section className="space-y-4 border-l-2 border-white/30 pl-4">
        <h3 className="font-display text-[1.4rem] font-extrabold uppercase leading-none [font-stretch:62%]">{t.consentTitle}</h3>
        <p className="max-w-[70ch] text-[0.9rem] leading-relaxed text-fog">{t.consentText}</p>
        <label className="flex min-h-12 cursor-pointer items-center gap-3 text-[0.95rem] text-bone">
          <input type="checkbox" name="consent" value="yes" required className="size-5 shrink-0 accent-[#4f9a6a]" />
          {t.consentCheck}
        </label>
      </section>
      <div className="space-y-4">
        <p className="text-[0.85rem] leading-snug text-ash">{t.creditNote}</p>
        {error && <p role="alert" className="border-l-2 border-[#e5a3a3] pl-4 text-[#f0c4c4]">{error}</p>}
        <button disabled={pending || !video} className={`${primaryButton} w-full sm:w-auto sm:min-w-[18rem]`}>{t.submit}</button>
      </div>
    </form>
  );
}
