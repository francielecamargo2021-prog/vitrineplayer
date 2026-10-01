import Image from "next/image";
import type { MediaSlotData } from "@/content/media";

/**
 * Foto ou vídeo real ocupando o container (object-cover). Sem mídia, mostra um
 * placeholder LISO (tom de gramado à noite) com a descrição da cena esperada.
 */
export function MediaSlot({
  slot,
  sizes = "100vw",
  priority = false,
  className = "",
  labelPosition = "bottom",
}: {
  slot: MediaSlotData;
  sizes?: string;
  priority?: boolean;
  className?: string;
  labelPosition?: "top" | "bottom";
}) {
  const { src, shot } = slot;
  if (src?.endsWith(".mp4")) {
    return (
      <video className={`absolute inset-0 size-full object-cover ${className}`} src={src} autoPlay muted loop playsInline preload="metadata" aria-hidden />
    );
  }
  if (src) {
    return <Image src={src} alt="" fill sizes={sizes} priority={priority} className={`object-cover ${className}`} />;
  }
  return (
    <div aria-hidden className={`media-placeholder absolute inset-0 ${className}`}>
      <span className={`absolute left-4 flex items-center gap-2 text-[0.72rem] text-white/40 md:left-6 ${labelPosition === "top" ? "top-20 md:top-24" : "bottom-4 md:bottom-6"}`}>
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden>
          <rect x="1.5" y="3.5" width="13" height="9" stroke="currentColor" />
          <circle cx="8" cy="8" r="2.2" stroke="currentColor" />
        </svg>
        {shot}
      </span>
    </div>
  );
}
