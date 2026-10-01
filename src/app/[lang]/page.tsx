import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { Header } from "@/components/home/Header";
import { Hero } from "@/components/home/Hero";
import { Concept } from "@/components/home/Concept";
import { HowItWorks } from "@/components/home/HowItWorks";
import { ProfileShowcase } from "@/components/home/ProfileShowcase";
import { ProBase } from "@/components/home/ProBase";
import { Pricing } from "@/components/home/Pricing";
import { Professionals } from "@/components/home/Professionals";
import { Footer } from "@/components/home/Footer";
import { CinemaBlock } from "@/components/home/CinemaBlock";
import { FootagePlaceholder } from "@/components/home/FootagePlaceholder";
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
        <Concept dict={dict} />
        <CinemaBlock src={media.stills.manifesto} fallback={<FootagePlaceholder seed={1} />} kicker={dict.cinema.base.kicker} title={dict.cinema.base.title} />
        <HowItWorks dict={dict} />
        <ProfileShowcase lang={lang} dict={dict} />
        <ProBase dict={dict} />
        <CinemaBlock src={media.stills.pitch} fallback={<FootagePlaceholder />} kicker={dict.cinema.region.kicker} title={dict.cinema.region.title} />
        <Pricing lang={lang} dict={dict} />
        <Professionals lang={lang} dict={dict} />
      </main>
      <Footer lang={lang} dict={dict} />
      <StickyCta lang={lang} dict={dict} />
    </>
  );
}
