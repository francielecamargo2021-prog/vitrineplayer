import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { Header } from "@/components/home/Header";
import { Hero } from "@/components/home/Hero";
import { Manifesto } from "@/components/home/Manifesto";
import { FullBleed } from "@/components/home/FullBleed";
import { HowItWorks } from "@/components/home/HowItWorks";
import { ProfileShowcase } from "@/components/home/ProfileShowcase";
import { Professionals } from "@/components/home/Professionals";
import { Pricing } from "@/components/home/Pricing";
import { Footer } from "@/components/home/Footer";
import { StickyCta } from "@/components/home/StickyCta";
import { media } from "@/content/media";

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <>
      <Header lang={lang} dict={dict} />
      <main>
        <Hero lang={lang} dict={dict} />
        <Manifesto dict={dict} />
        <FullBleed id="base" slot={media.base} title={dict.field.title} caption={dict.field.caption} stats={dict.field.stats} />
        <HowItWorks dict={dict} />
        <ProfileShowcase lang={lang} dict={dict} />
        <Professionals lang={lang} dict={dict} />
        <FullBleed slot={media.next} title={dict.next.title} />
        <Pricing lang={lang} dict={dict} />
      </main>
      <Footer lang={lang} dict={dict} />
      <StickyCta lang={lang} dict={dict} />
    </>
  );
}
