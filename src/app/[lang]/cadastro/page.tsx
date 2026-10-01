import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { privateMetadata } from "@/lib/seo";
import { MockShell } from "@/components/home/MockShell";
import { SignupMock } from "@/components/mockups/SignupMock";

export const metadata = privateMetadata;

export default async function SignupPage({ params }: PageProps<"/[lang]/cadastro">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  return (
    <MockShell lang={lang} dict={dict}>
      <SignupMock dict={dict} />
    </MockShell>
  );
}
