"use client";

import { useKeepAction } from "@/components/forms/use-keep-action";
import type { PanelDictionary } from "@/i18n/get-dictionary";
import type { FormState } from "@/lib/panel/actions";
import { Label, control, primaryButton } from "@/components/panel/controls";

/** Pedido pelo link público do YouTube (modo link, só 18+): link, duração, descrição do atleta e autorização. */
export function PvLinkRequestForm({
  action, t, req, types, positions, defaultPosition,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  t: PanelDictionary["pv"]["link"];
  req: PanelDictionary["pv"]["request"];
  types: { value: string; label: string }[];
  positions: { value: string; label: string }[];
  defaultPosition: string | null;
}) {
  const [state, formAction, pending] = useKeepAction(action);
  const code = state?.error;
  const error = code ? t.errors[code] ?? req.errors[code as keyof typeof req.errors] ?? req.errors.generic : null;
  return (
    <form onSubmit={formAction} className="space-y-10" data-testid="pv-link-request">
      <div className="grid gap-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Label text={t.url} hint={t.urlHint}>
          <input name="url" type="url" inputMode="url" required maxLength={300} placeholder="https://www.youtube.com/watch?v=" className={control} />
        </Label>
        <Label text={t.minutes}>
          <input name="minutes" type="number" inputMode="numeric" min={1} max={130} required className={control} />
        </Label>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <Label text={t.appearsAt} hint={t.appearsHint}>
          <input name="appears_at" inputMode="numeric" pattern="([0-9]{1,2}:)?[0-9]{1,3}:[0-5][0-9]" maxLength={8} placeholder="03:12" className={control} />
        </Label>
        <Label text={t.videoType}>
          <select name="video_type" defaultValue="full_match" className={control}>
            {types.map((o) => <option key={o.value} value={o.value} className="bg-graphite">{o.label}</option>)}
          </select>
        </Label>
      </div>
      <div className="grid gap-6 sm:grid-cols-3">
        <Label text={req.shirtNumber}>
          <input name="shirt_number" type="number" inputMode="numeric" min={0} max={99} required className={control} />
        </Label>
        <Label text={req.shirtColor} hint={req.shirtColorHint}>
          <input name="shirt_color" required minLength={2} maxLength={40} className={control} />
        </Label>
        <Label text={req.position}>
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
        <p className="text-[0.85rem] leading-snug text-ash">{req.creditNote}</p>
        {error && <p role="alert" className="border-l-2 border-[#e5a3a3] pl-4 text-[#f0c4c4]">{error}</p>}
        <button disabled={pending} className={`${primaryButton} w-full sm:w-auto sm:min-w-[18rem]`}>{t.submit}</button>
      </div>
    </form>
  );
}
