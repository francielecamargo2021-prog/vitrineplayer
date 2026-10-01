import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { privateMetadata } from "@/lib/seo";
import { MockShell } from "@/components/home/MockShell";
import { ProPortalMock } from "@/components/mockups/ProPortalMock";

export const metadata = privateMetadata;

export default async function ProPortalPage({ params }: PageProps<"/[lang]/profissional">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  return (
    <MockShell lang={lang} dict={dict}>
      <ProPortalMock dict={dict} />
    </MockShell>
  );
}
