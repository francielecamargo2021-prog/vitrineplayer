import { type NextRequest } from "next/server";
import { asUser } from "@/lib/db";
import { currentUser } from "@/lib/auth/server";
import { mfaToken } from "@/lib/auth/mfa";

/** Exportação dos dados de uma conta pelo admin (pedido do titular). O banco confere admin + segundo fator. */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/admin/exportar/[id]">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  const mfa = await mfaToken();
  if (!user || !mfa || !/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  try {
    const [r] = await asUser<{ j: unknown }>(user.id, (q) => q`select account_export(${id}::uuid) as j`, { mfa });
    return new Response(JSON.stringify(r.j, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="vitrineplayer-dados-${id}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
