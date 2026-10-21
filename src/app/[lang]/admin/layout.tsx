import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { privateMetadata } from "@/lib/seo";
import { requireAdminAccount } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata = privateMetadata;

/**
 * Área administrativa: sessão, papel ADMIN e segundo fator conferidos aqui, em cada
 * página e ação, e de novo no banco (is_admin() exige a prova do segundo fator).
 */
export default async function AdminLayout({ children, params }: LayoutProps<"/[lang]/admin">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const account = await requireAdminAccount(lang);
  return (
    <AdminShell lang={lang} name={account?.profile.full_name} env={process.env.VP_ENV ?? null}>
      {account ? children : <main className="gutter mx-auto max-w-3xl py-24 text-fog">Backend não configurado neste ambiente.</main>}
    </AdminShell>
  );
}
