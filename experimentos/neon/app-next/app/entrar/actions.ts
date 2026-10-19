"use server";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { asUser } from "@/lib/db";

export async function cadastrar(fd: FormData) {
  const email = String(fd.get("email")), password = String(fd.get("password")), name = String(fd.get("name"));
  const { data, error } = await auth.signUp.email({ email, password, name });
  if (error || !data?.user?.id) redirect(`/entrar?erro=${encodeURIComponent(error?.message ?? "cadastro")}`);
  // O cookie da sessão nova só chega na próxima requisição; o servidor completa o cadastro
  // com o ID que o Neon Auth acabou de devolver (a função só aceita o próprio usuário, uma vez).
  try {
    await asUser(data.user.id, (q) => q`select complete_signup(${"+5511999990001"}, ${"BR"}, ${"pt-BR"},
      ${["terms", "privacy", "guardian_declaration", "no_guarantee"]}::text[], ${"2026-10"})`);
  } catch (e) {
    redirect(`/entrar?erro=${encodeURIComponent("complete_signup: " + (e as Error).message)}`);
  }
  redirect("/painel");
}

export async function entrar(fd: FormData) {
  const { error } = await auth.signIn.email({ email: String(fd.get("email")), password: String(fd.get("password")) });
  if (error) redirect(`/entrar?erro=${encodeURIComponent(error.message ?? "login")}`);
  redirect("/painel");
}

export async function sair() {
  await auth.signOut();
  redirect("/entrar");
}
