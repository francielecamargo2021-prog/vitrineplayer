import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary, getPanelDictionary } from "@/i18n/get-dictionary";
import { privateMetadata } from "@/lib/seo";
import { MockShell } from "@/components/home/MockShell";
import { AthleteProfile } from "@/components/athlete/AthleteProfile";
import { AiReport } from "@/components/ai/AiReport";
import { demoAiReport } from "@/mocks/ai-report";

export const metadata = privateMetadata;

export default async function AthleteExamplePage({ params }: PageProps<"/[lang]/atleta/exemplo">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const panel = await getPanelDictionary(lang);
  return (
    <MockShell lang={lang} dict={dict}>
      <main className="gutter py-10 md:py-16">
        <p className="eyebrow">{dict.profile.index}</p>
        <div className="mt-8">
          <AthleteProfile dict={dict} variant="full" />
        </div>
        <section className="mt-16 max-w-5xl md:mt-24">
          <h2 className="mb-8 font-display text-[clamp(2.4rem,9vw,4.5rem)] font-black uppercase leading-[0.86] [font-stretch:62%]">{panel.ai.report.title}</h2>
          <AiReport report={demoAiReport} t={panel.ai.report} lang={lang} positionLabel={panel.positions.RW} demo />
        </section>
      </main>
    </MockShell>
  );
}
