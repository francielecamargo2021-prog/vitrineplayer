"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Runtime único de movimento (≈1 KB). Componentes de servidor apenas declaram atributos:
 *  - data-reveal            → recebe .is-in ao entrar na viewport
 *  - data-count="1234"      → número animado ao aparecer
 *  - data-parallax="0.08"   → deslocamento vertical sutil conforme scroll (desktop)
 *  - data-tilt              → inclinação 3D leve no hover (ponteiro fino)
 *  - data-words             → palavras (.w) acendem conforme o scroll
 *  - data-cta-hide          → seções onde a barra de CTA mobile some
 * Também marca <html data-scrolled> (header) e <html data-cta> (barra de CTA).
 */
export function MotionRuntime() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;

    const animateCount = (el: HTMLElement) => {
      const target = Number(el.dataset.count ?? 0);
      if (reduce || target === 0) {
        el.textContent = target.toLocaleString(root.lang);
        return;
      }
      const start = performance.now();
      const dur = 1600;
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 4);
        el.textContent = Math.round(target * eased).toLocaleString(root.lang);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.classList.add("is-in");
          if (el.dataset.count !== undefined) animateCount(el);
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );
    document.querySelectorAll<HTMLElement>("[data-reveal],[data-count]").forEach((el) => io.observe(el));

    const parallax = reduce || !finePointer ? [] : Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
    const wordBlocks = Array.from(document.querySelectorAll<HTMLElement>("[data-words]")).map((el) => ({
      el,
      words: Array.from(el.querySelectorAll<HTMLElement>(".w")),
    }));
    const ctaHide = Array.from(document.querySelectorAll<HTMLElement>("[data-cta-hide]"));

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        if (y > 24) root.setAttribute("data-scrolled", "");
        else root.removeAttribute("data-scrolled");
        const vh = window.innerHeight;
        const nearCtaZone = ctaHide.some((el) => {
          const r = el.getBoundingClientRect();
          return r.top < vh && r.bottom > 0;
        });
        if (y > vh * 0.85 && !nearCtaZone) root.setAttribute("data-cta", "");
        else root.removeAttribute("data-cta");
        for (const { el, words } of wordBlocks) {
          const r = el.getBoundingClientRect();
          const p = reduce ? 1 : Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.25)));
          const lit = Math.round(p * words.length);
          words.forEach((w, i) => w.classList.toggle("on", i < lit));
        }
        for (const el of parallax) {
          const rect = el.getBoundingClientRect();
          if (rect.bottom < -200 || rect.top > vh + 200) continue;
          const speed = Number(el.dataset.parallax) || 0.08;
          const offset = (rect.top + rect.height / 2 - vh / 2) * -speed;
          el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
        }
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const tilts = reduce || !finePointer ? [] : Array.from(document.querySelectorAll<HTMLElement>("[data-tilt]"));
    const onMove = (e: PointerEvent) => {
      const el = e.currentTarget as HTMLElement;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--ry", `${(x * 6).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${(-y * 6).toFixed(2)}deg`);
    };
    const onLeave = (e: PointerEvent) => {
      const el = e.currentTarget as HTMLElement;
      el.style.setProperty("--ry", "0deg");
      el.style.setProperty("--rx", "0deg");
    };
    tilts.forEach((el) => {
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);
    });

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      tilts.forEach((el) => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerleave", onLeave);
      });
    };
  }, [pathname]);

  return null;
}
