import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { legalDocs } from "@/content/legal";
import { LegalPage } from "@/components/legal/LegalPage";

export async function generateMetadata({ params }: PageProps<"/[lang]/privacidade">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const d = legalDocs.privacy[lang];
  return { title: `${d.title.join(" ")} · VitrinePlayer`, description: d.lead };
}

export default async function Page({ params }: PageProps<"/[lang]/privacidade">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  return <LegalPage lang={lang} kind="privacy" dict={await getDictionary(lang)} />;
}
