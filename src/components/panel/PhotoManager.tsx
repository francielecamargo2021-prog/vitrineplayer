"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { PHOTO_BUCKET, PHOTO_LIMIT } from "@/domain/athlete";
import type { PanelDictionary } from "@/i18n/get-dictionary";
import { deletePhoto, movePhoto, registerPhoto, replacePhoto, setFraming, setPrimaryPhoto } from "@/lib/panel/actions";
import { FramedPhoto } from "./FramedPhoto";
import { ghostButton, primaryButton } from "./controls";

export type PhotoItem = { id: string; url: string | null; isPrimary: boolean; x: number; y: number; zoom: number };

const MAX_INPUT = 15 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Reduz para ≤ 2048 px e converte para WebP (≈ 1 MB) antes do envio. */
async function compress(file: File) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const encode = (q: number) => new Promise<Blob>((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error("encode"))), "image/webp", q));
  let blob = await encode(0.84);
  if (blob.size > 1_400_000) blob = await encode(0.72);
  return { blob, w, h };
}

export function PhotoManager({ lang, athleteId, photos, t }: { lang: string; athleteId: string; photos: PhotoItem[]; t: PanelDictionary["photos"] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [queue, setQueue] = useState<{ file: File; preview: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [framing, setFramingState] = useState<PhotoItem | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const primary = photos.find((p) => p.isPrimary);
  const room = PHOTO_LIMIT - photos.length;

  const upload = async (file: File) => {
    const { blob, w, h } = await compress(file);
    const path = `${athleteId}/${crypto.randomUUID().replaceAll("-", "")}.webp`;
    const { error: e } = await createBrowserSupabase().storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: "image/webp", upsert: false });
    if (e) throw e;
    return { path, w, h };
  };

  const pick = (files: FileList | null) => {
    setError(null);
    const list = Array.from(files ?? []);
    if (list.some((f) => !TYPES.includes(f.type))) return setError(t.badType);
    if (list.some((f) => f.size > MAX_INPUT)) return setError(t.tooBig);
    if (list.length > room) setError(t.full);
    setQueue(list.slice(0, Math.max(room, 0)).map((file) => ({ file, preview: URL.createObjectURL(file) })));
  };

  const sendQueue = () =>
    start(async () => {
      try {
        for (const q of queue) {
          const { path, w, h } = await upload(q.file);
          const r = await registerPhoto(lang, athleteId, path, w, h);
          if (r.error) throw new Error(r.error);
        }
        queue.forEach((q) => URL.revokeObjectURL(q.preview));
        setQueue([]);
      } catch (e) {
        setError((e as Error).message === "full" ? t.full : t.badType);
      }
      router.refresh();
    });

  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });

  return (
    <div className="space-y-10">
      <p className="max-w-[62ch] leading-relaxed text-fog">{t.lead}</p>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Principal */}
        <div className="lg:col-span-5">
          <p className="eyebrow text-fog">{t.primary}</p>
          {framing ? (
            <Framer item={framing} t={t} onCancel={() => setFramingState(null)} onSave={(x, y, z) => run(async () => { await setFraming(lang, framing.id, x, y, z); setFramingState(null); })} />
          ) : (
            <>
              <FramedPhoto src={primary?.url} x={primary?.x} y={primary?.y} zoom={primary?.zoom} eager className="mt-3 aspect-[4/5] w-full border border-white/10" />
              {primary && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setFramingState(primary)} className={ghostButton}>{t.adjust}</button>
                  <button type="button" onClick={() => { replaceTarget.current = primary.id; replaceInput.current?.click(); }} className={ghostButton}>{t.replace}</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Galeria */}
        <div className="lg:col-span-7">
          <div className="flex items-baseline justify-between">
            <p className="eyebrow text-fog">{t.gallery}</p>
            <p className="text-[0.8rem] text-ash">{photos.length}/{PHOTO_LIMIT} {t.limit}</p>
          </div>
          {photos.length === 0 && <p className="mt-3 text-ash">{t.empty}</p>}
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((ph, i) => (
              <li key={ph.id} className="group">
                <FramedPhoto src={ph.url} x={ph.x} y={ph.y} zoom={ph.zoom} className={`aspect-square border ${ph.isPrimary ? "border-grass" : "border-white/10"}`} />
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.78rem] text-ash">
                  {ph.isPrimary ? (
                    <span className="text-grass">{t.primary}</span>
                  ) : (
                    <button type="button" disabled={pending} onClick={() => run(() => setPrimaryPhoto(lang, ph.id))} className="min-h-8 hover:text-bone">{t.makePrimary}</button>
                  )}
                  <button type="button" disabled={pending} onClick={() => { replaceTarget.current = ph.id; replaceInput.current?.click(); }} className="min-h-8 hover:text-bone">{t.replace}</button>
                  <button type="button" disabled={pending} onClick={() => confirm(t.confirmDelete) && run(() => deletePhoto(lang, athleteId, ph.id))} className="min-h-8 hover:text-[#f0c4c4]">{t.delete}</button>
                  <span className="ml-auto flex">
                    <button type="button" aria-label={t.moveUp} disabled={pending || i === 0} onClick={() => run(() => movePhoto(lang, athleteId, ph.id, -1))} className="grid size-8 place-items-center hover:text-bone disabled:opacity-30">‹</button>
                    <button type="button" aria-label={t.moveDown} disabled={pending || i === photos.length - 1} onClick={() => run(() => movePhoto(lang, athleteId, ph.id, 1))} className="grid size-8 place-items-center hover:text-bone disabled:opacity-30">›</button>
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {queue.length > 0 ? (
            <div className="mt-6 border border-white/15 p-4">
              <ul className="flex gap-2 overflow-x-auto">
                {queue.map((q) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <li key={q.preview}><img src={q.preview} alt="" className="size-20 object-cover" /></li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" disabled={pending} onClick={sendQueue} className={primaryButton}>{pending ? t.uploading : `${t.add} (${queue.length})`}</button>
                <button type="button" disabled={pending} onClick={() => setQueue([])} className={ghostButton}>{t.cancel}</button>
              </div>
            </div>
          ) : (
            room > 0 && (
              <button type="button" onClick={() => addInput.current?.click()} className="mt-6 flex h-28 w-full items-center justify-center border border-dashed border-white/25 text-fog transition-colors hover:border-white/60 hover:text-bone">
                + {t.add}
              </button>
            )
          )}
          <p className="mt-3 text-[0.8rem] text-ash">{t.rules}</p>
          <p className="mt-1 text-[0.8rem] text-ash">{t.privacy}</p>
          {error && <p role="alert" className="mt-3 text-[#f0c4c4]">{error}</p>}
        </div>
      </div>

      <input ref={addInput} type="file" accept={TYPES.join(",")} multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <input
        ref={replaceInput} type="file" accept={TYPES.join(",")} hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          const target = replaceTarget.current;
          if (!file || !target) return;
          if (!TYPES.includes(file.type)) return setError(t.badType);
          if (file.size > MAX_INPUT) return setError(t.tooBig);
          run(async () => { const { path, w, h } = await upload(file); await replacePhoto(lang, athleteId, target, path, w, h); });
        }}
      />
    </div>
  );
}

/** Enquadramento: arrastar para reposicionar + zoom. Prévia exata antes de salvar. */
function Framer({ item, t, onSave, onCancel }: { item: PhotoItem; t: PanelDictionary["photos"]; onSave: (x: number, y: number, z: number) => void; onCancel: () => void }) {
  const [x, setX] = useState(item.x);
  const [y, setY] = useState(item.y);
  const [z, setZ] = useState(item.zoom);
  const drag = useRef<{ px: number; py: number; x: number; y: number; w: number; h: number } | null>(null);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return (
    <div className="mt-3">
      <div
        className="touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          drag.current = { px: e.clientX, py: e.clientY, x, y, w: r.width, h: r.height };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setX(clamp(d.x - (e.clientX - d.px) / (d.w * z)));
          setY(clamp(d.y - (e.clientY - d.py) / (d.h * z)));
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <FramedPhoto src={item.url} x={x} y={y} zoom={z} eager className="aspect-[4/5] w-full border border-grass" />
      </div>
      <p className="mt-2 text-[0.8rem] text-ash">{t.dragHint}</p>
      <label className="mt-3 block">
        <span className="eyebrow text-fog">{t.zoom}</span>
        <input type="range" min={1} max={3} step={0.05} value={z} onChange={(e) => setZ(Number(e.target.value))} className="mt-2 w-full accent-[#4f9a6a]" />
      </label>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={() => onSave(x, y, z)} className={primaryButton}>{t.applyCrop}</button>
        <button type="button" onClick={onCancel} className={ghostButton}>{t.cancel}</button>
      </div>
    </div>
  );
}
