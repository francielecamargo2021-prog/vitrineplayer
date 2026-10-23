import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Archivo, Barlow_Condensed, IBM_Plex_Mono, Inter } from "next/font/google";
import { hasLocale, htmlLang, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { MotionRuntime } from "@/components/motion/MotionRuntime";
import { indexable } from "@/lib/seo";
import "../globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});
/** Landing: títulos em Barlow Condensed, texto em Inter (escopo .landing em globals.css). */
const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-barlow",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const viewport: Viewport = { themeColor: "#070708", colorScheme: "dark" };

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return {
    title: dict.meta.title,
    description: dict.meta.description,
    alternates: { languages: { "pt-BR": "/pt", es: "/es" } },
    ...(indexable ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  return (
    <html
      lang={htmlLang[lang]}
      className={`${archivo.variable} ${barlow.variable} ${inter.variable} ${plexMono.variable}`}
    >
      <body>
        {children}
        <MotionRuntime />
      </body>
    </html>
  );
}
