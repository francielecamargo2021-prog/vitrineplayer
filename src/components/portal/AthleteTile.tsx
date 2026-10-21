import Link from "next/link";
import type { PanelDictionary, PortalDictionary } from "@/i18n/get-dictionary";
import type { AthleteCard } from "@/lib/portal/data";
import { FramedPhoto } from "@/components/panel/FramedPhoto";
import { FavoriteButton } from "./PortalWidgets";

/** Cartão do atleta no portal: foto grande, nome, idade, posição e local (estado/país). */
export function AthleteTile({ a, lang, p, t, region, extra, updated = false, badge }: {
  a: AthleteCard; lang: string; p: PanelDictionary; t: PortalDictionary; region: Intl.DisplayNames; extra?: React.ReactNode; updated?: boolean; badge?: string;
}) {
  const pos = a.primary_position ? (p.positions as Record<string, string>)[a.primary_position] ?? a.primary_position : null;
  const place = [a.state, region.of(a.country) ?? a.country].filter(Boolean).join(", ");
  return (
    <li className="group relative border border-white/[0.08] bg-graphite transition-colors hover:border-white/30" data-testid="athlete-tile">
      <Link href={`/${lang}/portal/atleta/${a.id}`} className="block">
        <FramedPhoto
          src={a.photo ? `/api/fotos/${a.photo}` : null} x={a.focal_x ?? 0.5} y={a.focal_y ?? 0.5} zoom={a.zoom ?? 1}
          className="aspect-[4/5]"
        />
        <div className="p-3">
          <p className="truncate font-semibold text-bone">{a.display_name}</p>
          <p className="mt-1 text-[0.8rem] text-fog">{a.age} {t.search.years}{pos ? ` · ${pos}` : ""}</p>
          <p className="mt-0.5 truncate text-[0.8rem] text-ash">{place}{a.has_video ? ` · ${t.search.video}` : ""}</p>
        </div>
      </Link>
      {(updated || badge) && (
        <span className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {updated && <span className="bg-grass px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-[0.08em] text-ink" title={t.workspace.updatedHint} data-testid="atualizado">{t.workspace.updated}</span>}
          {badge && <span className="bg-ink/80 px-2 py-0.5 text-[0.7rem] text-bone">{badge}</span>}
        </span>
      )}
      <div className="absolute right-2 top-2">
        <FavoriteButton lang={lang} athleteId={a.id} on={a.is_favorite} labels={{ on: t.profile.unfavorite, off: t.profile.favorite }} compact />
      </div>
      {extra}
    </li>
  );
}
