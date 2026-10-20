import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { asUser, dbReady } from "@/lib/db";
import type { Database } from "@/lib/db/database.types";
import { currentUser, getAuth, type AuthUser } from "./server";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type AccountProfile = { id: string; full_name: string; role: AppRole; country: string | null; signup_complete: boolean };

/**
 * Conta da requisição atual (cacheada por requisição).
 * `backend: false` = login ou banco não configurados neste ambiente.
 * O perfil é lido COMO o próprio usuário (RLS): ninguém lê o perfil de outra pessoa.
 */
export const getAccount = cache(async (): Promise<
  { backend: false; user: null; profile: null } | { backend: true; user: AuthUser | null; profile: AccountProfile | null }
> => {
  if (!getAuth() || !dbReady()) return { backend: false, user: null, profile: null };
  const user = await currentUser();
  if (!user) return { backend: true, user: null, profile: null };
  const rows = await asUser<AccountProfile>(user.id, (q) => q`
    select p.id, p.full_name, p.role::text as role, p.country,
           exists (select 1 from consents c where c.profile_id = p.id and c.athlete_id is null) as signup_complete
      from profiles p where p.id = ${user.id}`);
  return { backend: true, user, profile: rows[0] ?? null };
});

/**
 * Exige uma conta pronta para usar as áreas privadas. Ordem das verificações:
 * sem sessão → Entrar · e-mail não confirmado → código · cadastro incompleto → concluir.
 * Retorna `null` quando o backend não está configurado (a página mostra o aviso).
 */
export async function requireAccount(lang: string) {
  const a = await getAccount();
  if (!a.backend) return null;
  if (!a.user) redirect(`/${lang}/entrar`);
  if (!a.user.emailVerified) redirect(`/${lang}/entrar/verificar`);
  if (!a.profile || !a.profile.signup_complete) redirect(`/${lang}/cadastro/concluir`);
  return { user: a.user, profile: a.profile };
}

/** Área do responsável. Admin vai para /admin; outros papéis não entram no painel da família. */
export async function requireGuardianAccount(lang: string) {
  const s = await requireAccount(lang);
  if (!s) return null;
  if (s.profile.role === "ADMIN") redirect(`/${lang}/admin`);
  if (s.profile.role !== "RESPONSIBLE") redirect(`/${lang}`);
  return s;
}

/**
 * Área administrativa. Quem não é admin recebe 404 (a área não se anuncia).
 * A garantia real está no banco: políticas *_admin e funções admin_review_*.
 */
export async function requireAdminAccount(lang: string) {
  const a = await getAccount();
  if (!a.backend) return null;
  if (!a.user) redirect(`/${lang}/entrar`);
  if (!a.user.emailVerified) redirect(`/${lang}/entrar/verificar`);
  if (a.profile?.role !== "ADMIN") notFound();
  return { user: a.user, profile: a.profile };
}
