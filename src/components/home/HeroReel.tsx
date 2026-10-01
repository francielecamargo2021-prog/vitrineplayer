"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { HeroClip } from "@/content/media";

const FADE = 0.7; // segundos de sobreposição no corte

/** Media query reativa; `null` no servidor (antes de montar). */
function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => null,
  );
}

/**
 * Montagem de vídeo do hero: toca os clipes em sequência com crossfade entre
 * dois <video>, escolhe a versão mobile no celular, pausa fora da tela/aba
 * oculta e respeita prefers-reduced-motion (mostra só o poster).
 */
export function HeroReel({ clips, chapters }: { clips: HeroClip[]; chapters: string[] }) {
  const videoA = useRef<HTMLVideoElement>(null);
  const videoB = useRef<HTMLVideoElement>(null);
  const [slots, setSlots] = useState<[number, number]>([0, 1 % clips.length]); // clipe em cada <video>
  const [layer, setLayer] = useState<0 | 1>(0); // qual <video> está visível
  const [progress, setProgress] = useState(0);
  const mobile = useMedia("(max-width: 767px)");
  const still = useMedia("(prefers-reduced-motion: reduce)");
  const index = slots[layer];

  const srcOf = (i: number) => {
    const c = clips[i];
    return mobile && c.srcMobile ? c.srcMobile : c.src;
  };
  const videoOf = (k: 0 | 1) => (k === 0 ? videoA.current : videoB.current);

  // Toca a camada ativa (desde o início) e pausa quando o hero sai da tela ou a aba fica oculta.
  useEffect(() => {
    const active = videoOf(layer);
    if (!active || still !== false) return;
    active.currentTime = 0;
    const section = active.closest("section");
    let visible = true;
    const sync = () => (visible && !document.hidden ? active.play().catch(() => {}) : active.pause());
    sync();
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      sync();
    });
    if (section) io.observe(section);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [layer, still, mobile]);

  const onTime = (k: 0 | 1, v: HTMLVideoElement) => {
    if (k !== layer || !v.duration) return;
    setProgress(v.currentTime / v.duration);
    if (clips.length > 1 && v.duration - v.currentTime < FADE) {
      const other = (1 - k) as 0 | 1;
      setSlots((s) => {
        const next: [number, number] = [...s];
        next[other] = (s[k] + 1) % clips.length;
        return next;
      });
      setLayer(other);
      setProgress(0);
    }
  };

  const first = clips[0];

  return (
    <>
      {first.poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={first.poster} alt="" aria-hidden className="absolute inset-0 size-full object-cover" fetchPriority="high" />
      )}
      {mobile !== null &&
        ([0, 1] as const).map((k) => (
          <video
            key={k}
            ref={k === 0 ? videoA : videoB}
            className="absolute inset-0 size-full object-cover transition-opacity ease-linear [animation:hero-push_9s_var(--ease-cine)_both]"
            style={{ opacity: layer === k ? 1 : 0, transitionDuration: `${FADE}s` }}
            src={srcOf(slots[k])}
            poster={clips[slots[k]].poster}
            muted
            playsInline
            loop={clips.length === 1}
            preload={layer === k ? "auto" : "metadata"}
            onTimeUpdate={(e) => onTime(k, e.currentTarget)}
            aria-hidden
          />
        ))}
      <ReelIndicator total={clips.length} index={index} label={chapters[clips[index].chapter] ?? ""} progress={progress} />
    </>
  );
}

/** Indicador de capítulos — também usado (via CSS) na montagem de fallback. */
export function ReelIndicator({ total, index, label, progress }: { total: number; index: number; label: string; progress: number }) {
  return (
    <div className="reel-indicator">
      <p className="eyebrow flex items-center gap-3 text-white/70">
        <span className="tabular-nums text-bone">{String(index + 1).padStart(2, "0")}</span>
        <span className="h-px w-5 bg-white/30" />
        <span>{label}</span>
      </p>
      <div className="flex gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className="relative h-[2px] flex-1 overflow-hidden bg-white/15">
            <span
              className="absolute inset-0 origin-left bg-bone"
              style={{ transform: `scaleX(${i < index ? 1 : i === index ? progress : 0})` }}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
