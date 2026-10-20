/** Título de página do portal (pôster condensado, segunda linha vazada). */
export function PortalTitle({ title, lead }: { title: string[]; lead?: string }) {
  return (
    <div>
      <h1 className="font-display text-[clamp(2.6rem,10vw,5.5rem)] font-black uppercase leading-[0.85] [font-stretch:62%]">
        {title.map((x, i) => (
          <span key={x} className={`block ${i > 0 ? "text-transparent [-webkit-text-stroke:0.02em_#efeee8]" : "text-[#e6e5de]"}`}>{x}</span>
        ))}
      </h1>
      {lead && <p className="mt-4 max-w-[60ch] text-fog">{lead}</p>}
    </div>
  );
}
