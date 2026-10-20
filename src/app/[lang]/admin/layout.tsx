import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { privateMetadata } from "@/lib/seo";
import { requireAdminAccount } from "@/lib/auth/session";
import { getSession } from "@/lib/panel/data";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata = privateMetadata;

/** Área administrativa. Sessão e papel conferidos aqui, em cada página e de novo no banco. */
export default async function AdminLayout({ children, params }: LayoutProps<"/[lang]/admin">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const account = await requireAdminAccount(lang);
  const data = account ? (await getSession()).supabase : null;
  return (
    <AdminShell lang={lang} name={account?.profile.full_name} env={process.env.VP_ENV ?? null}>
      {!account ? (
        <main className="gutter mx-auto max-w-3xl py-24 text-fog">Backend não configurado neste ambiente.</main>
      ) : data ? children : (
        <main className="gutter mx-auto max-w-3xl py-24 text-fog" data-testid="admin-migracao">
          Acesso de administrador confirmado. As listas de revisão voltam na próxima etapa da migração (dados).
        </main>
      )}
    </AdminShell>
  );
}
