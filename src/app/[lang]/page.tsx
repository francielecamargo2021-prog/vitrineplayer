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
        <HowItWorks dict={dict} />
        <ProfileShowcase lang={lang} dict={dict} />
        <ProBase dict={dict} />
        <Pricing lang={lang} dict={dict} />
        <Professionals lang={lang} dict={dict} />
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  );
}
