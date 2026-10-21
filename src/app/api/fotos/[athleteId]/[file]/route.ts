import { type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/server";
import { photoBlobPath, photosReady, readPhoto } from "@/lib/photos/server";
import { mfaToken } from "@/lib/auth/mfa";

/**
 * Entrega uma foto do atleta SOMENTE se o banco permitir ao usuário logado (RLS de
 * storage.objects: responsável vinculado, admin ou profissional autorizado). Sem
 * permissão, a resposta é 404 (não revela se a foto existe). Nunca há URL pública.
 *
 * Cache: o navegador guarda a foto, mas pergunta ao servidor a CADA exibição
 * (no-cache + ETag). A permissão é conferida sempre; se nada mudou, a resposta é 304
 * sem baixar o arquivo de novo. Assim um bloqueio ou pausa vale na hora.
 * (O nome do arquivo é único por envio, então serve como ETag.)
 */
export const dynamic = "force-dynamic";

const headers = (etag: string) => ({
  "Cache-Control": "private, no-cache",
  ETag: etag,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
});

export async function GET(req: NextRequest, ctx: RouteContext<"/api/fotos/[athleteId]/[file]">) {
  const { athleteId, file } = await ctx.params;
  if (!photosReady()) return new Response(null, { status: 503 });
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401 });
  const name = `${athleteId}/${file}`;
  // admin: a prova do segundo fator (cookie) acompanha a consulta; sem ela, o banco não reconhece o admin
  const url = await photoBlobPath(user.id, name, { mfa: await mfaToken() });
  if (!url) return new Response(null, { status: 404 });
  const etag = `"${file}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: headers(etag) });
  const stream = await readPhoto(url);
  if (!stream) return new Response(null, { status: 404 });
  return new Response(stream, { headers: { ...headers(etag), "Content-Type": "image/webp", "Content-Disposition": "inline" } });
}
