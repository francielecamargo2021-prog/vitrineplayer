import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { privateMetadata } from "@/lib/seo";
import { MockShell } from "@/components/home/MockShell";
import { AthleteProfile } from "@/components/athlete/AthleteProfile";

export const metadata = privateMetadata;

export default async function AthleteExamplePage({ params }: PageProps<"/[lang]/atleta/exemplo">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  return (
    <MockShell lang={lang} dict={dict}>
      <main className="gutter py-10 md:py-16">
        <p className="eyebrow">{dict.profile.index}</p>
        <div className="mt-8">
          <AthleteProfile dict={dict} variant="full" />
        </div>
      </main>
    </MockShell>
  );
}
