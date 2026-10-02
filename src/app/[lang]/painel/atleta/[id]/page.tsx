import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale, htmlLang } from "@/i18n/config";
import { getPanelDictionary } from "@/i18n/get-dictionary";
import { getAthleteBundle, requireGuardian, signedPhotoUrls } from "@/lib/panel/data";
import { AthleteSheet } from "@/components/panel/AthleteSheet";

/** Pré-visualização privada da ficha (o responsável vê o perfil como apresentação). */
export default async function AthletePage({ params }: PageProps<"/[lang]/painel/atleta/[id]">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireGuardian(lang);
  if (!session) return null;
  const p = await getPanelDictionary(lang);
  const bundle = await getAthleteBundle(session.supabase, session.user.id, id);
  const urls = await signedPhotoUrls(session.supabase, bundle.photos.map((ph) => ph.storage_path!).filter(Boolean));
  return (
    <AthleteSheet
      bundle={bundle} urls={urls} p={p} locale={htmlLang[lang]}
      actions={
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Link href={`/${lang}/painel/atleta/${id}/editar/dados`} className="inline-flex h-14 items-center justify-center bg-ink px-7 font-display text-[1.15rem] font-extrabold uppercase tracking-[0.03em] text-bone [font-stretch:62%] transition-colors hover:bg-turf sm:min-w-[14rem]">
            {p.dashboard.edit}
          </Link>
          <div className="flex gap-6 text-[0.9rem] font-medium sm:ml-4">
            <Link href={`/${lang}/painel?atleta=${id}`} className="underline decoration-ink/30 underline-offset-[6px] hover:decoration-ink">{p.shell.panel}</Link>
            <Link href={`/${lang}/painel/atleta/${id}/editar/privacidade`} className="underline decoration-ink/30 underline-offset-[6px] hover:decoration-ink">{p.dashboard.privacy}</Link>
          </div>
        </div>
      }
    />
  );
}
