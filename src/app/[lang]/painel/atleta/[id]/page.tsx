import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale, htmlLang } from "@/i18n/config";
import { getPanelDictionary } from "@/i18n/get-dictionary";
import { getAthleteBundle, requireGuardian, signedPhotoUrls } from "@/lib/panel/data";
import { AthleteSheet } from "@/components/panel/AthleteSheet";
import { ghostButton, primaryButton } from "@/components/panel/controls";

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
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href={`/${lang}/painel/atleta/${id}/editar/dados`} className={`${primaryButton} w-full sm:w-auto sm:min-w-[14rem]`}>{p.dashboard.edit}</Link>
          <Link href={`/${lang}/painel?atleta=${id}`} className={`${ghostButton} w-full sm:w-auto`}>{p.shell.panel}</Link>
        </div>
      }
    />
  );
}
