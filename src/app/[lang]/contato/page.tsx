import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { legalDocs } from "@/content/legal";
import { LegalPage } from "@/components/legal/LegalPage";

export async function generateMetadata({ params }: PageProps<"/[lang]/contato">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const d = legalDocs.contact[lang];
  return { title: `${d.title.join(" ")} · VitrinePlayer`, description: d.lead };
}

export default async function Page({ params }: PageProps<"/[lang]/contato">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  return <LegalPage lang={lang} kind="contact" dict={await getDictionary(lang)} />;
}
