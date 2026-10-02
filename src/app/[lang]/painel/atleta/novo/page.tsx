import { notFound } from "next/navigation";
import { hasLocale, htmlLang } from "@/i18n/config";
import { getPanelDictionary } from "@/i18n/get-dictionary";
import { requireGuardian } from "@/lib/panel/data";
import { createAthlete } from "@/lib/panel/actions";
import { NewAthleteForm } from "@/components/panel/NewAthleteForm";

export default async function NewAthletePage({ params }: PageProps<"/[lang]/painel/atleta/novo">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireGuardian(lang);
  if (!session) return null;
  const p = await getPanelDictionary(lang);
  return (
    <main className="gutter mx-auto max-w-3xl pb-24 pt-10 md:pt-16">
      <h1 className="font-display text-[clamp(3rem,14vw,6rem)] font-black uppercase leading-[0.84] [font-stretch:62%]">
        <span className="block text-[#e6e5de]">{p.newAthlete.title[0]}</span>
        <span className="block text-transparent [-webkit-text-stroke:0.018em_#efeee8]">{p.newAthlete.title[1]}</span>
      </h1>
      <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-fog">{p.newAthlete.lead}</p>
      <NewAthleteForm action={createAthlete.bind(null, lang)} p={p} cancelHref={`/${lang}/painel`} locale={htmlLang[lang]} defaultCountry={session.profile.country} />
    </main>
  );
}
