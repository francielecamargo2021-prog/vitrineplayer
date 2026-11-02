"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { completeMultipartUpload, createMultipartUpload, uploadPart } from "@vercel/blob/client";
import type { PanelDictionary } from "@/i18n/get-dictionary";
import { browserStore, fingerprint, resumable, uploadFile, type UploadSdk } from "@/lib/videos/resumable-upload";
import { finishVideoUpload, startVideoUpload } from "@/lib/panel/pv-actions";
import { ghostButton, primaryButton } from "@/components/panel/controls";

const ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv";
const kinds = ["full_match", "highlights", "training"] as const;

const sdk: UploadSdk = {
  createMultipartUpload: (p, o) => createMultipartUpload(p, o),
  uploadPart: (p, body, o) => uploadPart(p, body, o),
  completeMultipartUpload: (p, parts, o) => completeMultipartUpload(p, parts, o),
};

/** Duração lida do próprio arquivo pelo navegador (a PitchVision confere de novo ao processar). */
function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (d: number) => { URL.revokeObjectURL(url); resolve(d); };
    v.preload = "metadata";
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : NaN);
    v.onerror = () => done(NaN);
    v.src = url;
  });
}

const noSubscribe = () => () => {};
function hasSavedUpload(athleteId: string) {
  try {
    return Object.keys(localStorage).some((k) => k.startsWith(`vp-up:${athleteId}|`));
  } catch {
    return false;
  }
}

const mb = (n: number) => (n / 1024 / 1024).toLocaleString(undefined, { maximumFractionDigits: n > 1024 ** 3 ? 0 : 1 });

type Phase = "idle" | "sending" | "paused" | "checking" | "done";

/**
 * Envio do vídeo do jogo direto para o armazenamento privado: em partes, com novas tentativas e retomada.
 * O progresso é o número real de bytes confirmados (sem barra simulada).
 */
export function VideoUploader({ lang, athleteId, t }: { lang: string; athleteId: string; t: PanelDictionary["pv"]["videos"] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [kind, setKind] = useState<(typeof kinds)[number]>("full_match");
  const [phase, setPhase] = useState<Phase>("idle");
  const [sent, setSent] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [cleared, setCleared] = useState(false);
  // existe envio pela metade salvo neste navegador? (no servidor: não)
  const savedUpload = useSyncExternalStore(noSubscribe, () => hasSavedUpload(athleteId), () => false);
  const hasSaved = savedUpload && !cleared;

  async function send(file: File) {
    setError(null);
    setPending(file);
    const duration = await readDuration(file);
    if (!Number.isFinite(duration) || duration < 30 || duration > 7800) return fail("duration");
    const fp = fingerprint(file, athleteId);
    const saved = browserStore.load(fp);
    const resume = resumable(saved, fp) ? saved : null;
    const start = await startVideoUpload(athleteId, { size: file.size, type: file.type }, resume?.pathname);
    if (!start.ok) return fail(start.error);
    const ac = new AbortController();
    abort.current = ac;
    setPhase("sending");
    setTotal(file.size);
    try {
      const state = resume
        ? { ...resume, token: start.clientToken, expiresAt: start.validUntil }
        : { fingerprint: fp, pathname: start.pathname, token: start.clientToken, contentType: file.type, size: file.size, expiresAt: start.validUntil };
      const out = await uploadFile({ file, state, sdk, store: browserStore, signal: ac.signal, onProgress: (b) => setSent(b) });
      setPhase("checking");
      const reg = await finishVideoUpload(lang, athleteId, { pathname: out.pathname, size: file.size, type: file.type, durationS: duration, videoType: kind });
      if (!reg.ok) return fail(reg.error ?? "generic");
      setPhase("done");
      setPending(null);
      setCleared(true);
      if (input.current) input.current.value = "";
      router.refresh();
    } catch {
      if (ac.signal.aborted) { setPhase("idle"); return; }
      setPhase("paused");
      setError("generic");
    }
  }

  function fail(code: string) {
    setPhase("idle");
    setError(code);
  }

  const pct = total ? Math.floor((sent / total) * 100) : 0;
  const err = error ? t.errors[error as keyof typeof t.errors] ?? t.errors.generic : null;
  const busy = phase === "sending" || phase === "checking";

  return (
    <section className="space-y-5" data-testid="pv-upload">
      <fieldset disabled={busy}>
        <legend className="eyebrow text-fog">{t.type}</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {kinds.map((k) => (
            <label key={k} className="cursor-pointer">
              <input type="radio" name="pv_video_kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="peer sr-only" />
              <span className="inline-flex min-h-11 items-center border border-white/15 px-4 text-[0.9rem] text-fog transition-colors peer-checked:border-grass peer-checked:bg-grass/15 peer-checked:text-bone peer-focus-visible:outline-2 peer-focus-visible:outline-grass">
                {t.types[k]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="max-w-[62ch] text-[0.85rem] leading-snug text-ash">{t.hint}</p>
      {hasSaved && phase === "idle" && <p className="border-l-2 border-white/30 pl-4 text-[0.9rem] text-fog">{t.resumeFound}</p>}
      <input ref={input} type="file" accept={ACCEPT} className="sr-only" id={`pv-file-${athleteId}`}
        onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void send(f); }} />
      {!busy && (
        <label htmlFor={`pv-file-${athleteId}`} className={`${primaryButton} w-full cursor-pointer sm:w-auto sm:min-w-[18rem]`}>{t.pick}</label>
      )}
      {(busy || phase === "paused") && (
        <div className="space-y-2" aria-live="polite">
          <div className="h-1.5 w-full max-w-xl bg-white/12">
            <div className="h-full bg-grass transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[0.85rem] text-fog">
            {phase === "checking" ? t.checking : `${t.sending}: ${mb(sent)} ${t.of} ${mb(total)} MB (${pct}%)`}
          </p>
        </div>
      )}
      {phase === "sending" && <button type="button" onClick={() => abort.current?.abort()} className={ghostButton}>{t.cancel}</button>}
      {phase === "paused" && pending && (
        <div className="space-y-3">
          <p className="border-l-2 border-white/30 pl-4 text-[0.9rem] text-fog">{t.paused}</p>
          <button type="button" onClick={() => void send(pending)} className={primaryButton}>{t.resume}</button>
        </div>
      )}
      {phase === "done" && <p className="border-l-2 border-grass pl-4 text-bone" role="status">{t.done}</p>}
      {err && phase !== "paused" && <p role="alert" className="border-l-2 border-[#e5a3a3] pl-4 text-[#f0c4c4]">{err}</p>}
    </section>
  );
}
