import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { GeminiBatchClient } from "@/lib/ai/gemini";
import { runCycle } from "@/lib/ai/pipeline";
import { SupabaseAiRepo, serviceClient } from "@/lib/ai/repo-supabase";

/**
 * Ciclo do processador de avaliações por IA (agendador → POST com
 * `Authorization: Bearer $CRON_SECRET`). Frequência sugerida: a cada hora; o
 * próprio ciclo decide quando um lote vale a pena ser enviado.
 *
 * Travas contra custo indevido (todas precisam estar liberadas para enviar):
 *  1. ai_settings.enabled = true (banco; padrão false)
 *  2. AI_ANALYSIS_ENABLED=true (ambiente)
 *  3. GEMINI_API_KEY presente (somente servidor)
 *  4. orçamento diário e mensal em ai_settings
 */
export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || got.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = serviceClient();
  if (!db) return NextResponse.json({ error: "backend not configured" }, { status: 503 });

  const paidAllowed = process.env.AI_ANALYSIS_ENABLED === "true";
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  const client = paidAllowed && apiKey ? new GeminiBatchClient({ apiKey, allowPaid: true }) : null;

  const summary = await runCycle({ repo: new SupabaseAiRepo(db), client, paidAllowed });
  return NextResponse.json(summary);
}
