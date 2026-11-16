import { currentUser } from "@/lib/auth/server";
import { asUser } from "@/lib/db";
import { pvClient } from "@/lib/pitchvision/client";
import { FRAME_WIDTH } from "@/lib/pitchvision/calibration";

/**
 * Imagens da PitchVision servidas pela VitrinePlayer (o navegador nunca fala com a PitchVision):
 *  * candidato/{trecho}: miniatura para a escolha visual do atleta — só enquanto o pedido espera a escolha;
 *  * evidencia/{id}: imagem ou clipe do relatório concluído;
 *  * quadro/{segundos}: imagem do jogo para marcar o campo — só enquanto o pedido espera a escolha (partida pronta).
 * A permissão vem do BANCO, consultado como o usuário (RLS: só o responsável vinculado lê o pedido).
 * Sem permissão → 404 (não revela se existe). Nada fica em cache compartilhado.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const headers = (type: string) => ({
  "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer", "Content-Disposition": "inline",
});

export async function GET(_req: Request, ctx: RouteContext<"/api/pitchvision/[requestId]/[kind]/[ref]">) {
  const { requestId, kind, ref } = await ctx.params;
  if (!UUID.test(requestId) || !["candidato", "evidencia", "quadro"].includes(kind)) return new Response(null, { status: 404 });
  const client = pvClient();
  if (!client) return new Response(null, { status: 503 });
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401 });
  const [row] = await asUser<{ pv_request_id: string | null; pv_match_id: string | null; pv_stage: string | null; status: string }>(user.id, (q) =>
    q`select pv_request_id, pv_match_id, pv_stage, status::text as status from ai_analysis_requests where id = ${requestId} and provider = 'pitchvision'`);
  if (!row?.pv_request_id) return new Response(null, { status: 404 });
  if (kind === "candidato" && row.pv_stage !== "athlete_pick") return new Response(null, { status: 404 });
  if (kind === "evidencia" && row.status !== "completed") return new Response(null, { status: 404 });
  if (kind === "quadro") {
    if (row.pv_stage !== "athlete_pick" || !row.pv_match_id || !/^\d{1,5}$/.test(ref)) return new Response(null, { status: 404 });
    try {
      const res = await client.getFrame(row.pv_match_id, Number(ref), FRAME_WIDTH);
      if (res.headers.get("content-type") !== "image/jpeg") return new Response(null, { status: 404 });
      return new Response(res.body, { headers: headers("image/jpeg") });
    } catch {
      return new Response(null, { status: 404 });
    }
  }
  try {
    const res = await client.getBinary(row.pv_request_id, kind === "candidato" ? "thumbnail" : "evidence", ref);
    const type = res.headers.get("content-type") ?? "";
    if (!/^(image\/jpeg|video\/mp4)$/.test(type)) return new Response(null, { status: 404 });
    return new Response(res.body, { headers: headers(type) });
  } catch {
    return new Response(null, { status: 404 });
  }
}
