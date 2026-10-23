import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { Header } from "@/components/home/Header";
import { Hero } from "@/components/home/Hero";
import { Manifesto } from "@/components/home/Manifesto";
import { HowItWorks } from "@/components/home/HowItWorks";
import { ProfileShowcase } from "@/components/home/ProfileShowcase";
import { Professionals } from "@/components/home/Professionals";
import { BaseSection } from "@/components/home/BaseSection";
import { Pricing } from "@/components/home/Pricing";
import { Closing } from "@/components/home/Closing";
import { Footer } from "@/components/home/Footer";
import { StickyCta } from "@/components/home/StickyCta";

/**
 * Landing: vídeo (hero) → A história → B como funciona → C perfil → D profissionais →
 * E futebol de base → F cadastro → G encerramento → rodapé. `.landing` aplica a
 * tipografia e a paleta da landing sem mexer no restante do site.
 */
export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <div className="landing">
      <Header lang={lang} dict={dict} />
      <main>
        <Hero lang={lang} dict={dict} />
        <Manifesto dict={dict} />
        <HowItWorks dict={dict} />
        <ProfileShowcase lang={lang} dict={dict} />
        <Professionals lang={lang} dict={dict} />
        <BaseSection dict={dict} />
        <Pricing lang={lang} dict={dict} />
        <Closing lang={lang} dict={dict} />
      </main>
      <Footer lang={lang} dict={dict} />
      <StickyCta lang={lang} dict={dict} />
    </div>
  );
}
