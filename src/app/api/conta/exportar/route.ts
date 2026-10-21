import { asUser } from "@/lib/db";
import { currentUser } from "@/lib/auth/server";

/** A própria pessoa baixa todos os dados que a plataforma guarda sobre ela (LGPD). */
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401 });
  try {
    const [r] = await asUser<{ j: unknown }>(user.id, (q) => q`select account_export(${user.id}::uuid) as j`);
    return new Response(JSON.stringify(r.j, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="vitrineplayer-meus-dados.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response(null, { status: 500 });
  }
}
