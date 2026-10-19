import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { privateMetadata } from "@/lib/seo";
import { requireAdmin } from "@/lib/admin/data";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata = privateMetadata;

/** Área administrativa. Sessão e papel conferidos aqui, em cada página e de novo no banco. */
export default async function AdminLayout({ children, params }: LayoutProps<"/[lang]/admin">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireAdmin(lang);
  return (
    <AdminShell lang={lang} name={session?.profile.full_name} env={process.env.VP_ENV ?? null}>
      {session ? children : (
        <main className="gutter mx-auto max-w-3xl py-24 text-fog">Backend não configurado neste ambiente.</main>
      )}
    </AdminShell>
  );
}
