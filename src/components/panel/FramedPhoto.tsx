/**
 * Foto com o enquadramento salvo (ponto focal + zoom), sem gerar novo arquivo.
 * URLs são temporárias (bucket privado), por isso <img> simples.
 */
export function FramedPhoto({
  src, x = 0.5, y = 0.5, zoom = 1, alt = "", className = "", eager = false,
}: { src?: string | null; x?: number; y?: number; zoom?: number; alt?: string; className?: string; eager?: boolean }) {
  const pos = `${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%`;
  return (
    <div className={`relative overflow-hidden bg-pitch ${className}`}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src} alt={alt} loading={eager ? "eager" : "lazy"} draggable={false}
          className="absolute inset-0 size-full select-none object-cover"
          style={{ objectPosition: pos, transform: `scale(${zoom})`, transformOrigin: pos }}
        />
      )}
    </div>
  );
}
