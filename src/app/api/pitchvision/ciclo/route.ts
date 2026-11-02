import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runPvCycle } from "@/lib/pitchvision/integrator";
import { pvClient, pvConfig } from "@/lib/pitchvision/client";
import { pvRepo } from "@/lib/pitchvision/repo-db";
import { athleteRef } from "@/lib/pitchvision/signature";
import { blobSigner, videosReady } from "@/lib/videos/server";

/**
 * Ciclo da integração PitchVision (agendador → POST com `Authorization: Bearer $CRON_SECRET`).
 * Envia pedidos na fila e confere a etapa real dos que estão em andamento (reserva dos avisos).
 * Sem PITCHVISION_ENABLED=true, chave e Blob de vídeos configurados, não faz nada.
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
  const cfg = pvConfig();
  const repo = pvRepo();
  const client = pvClient();
  if (!cfg || !repo || !client || !videosReady()) return NextResponse.json({ skipped: "not configured" });
  const summary = await runPvCycle({
    repo, client, signer: blobSigner, athleteRef: (id) => athleteRef(cfg.refKey, id),
    onError: (where, requestId, e) => console.error(`[pitchvision] ${where} ${requestId}: ${e instanceof Error ? e.message : "erro"}`),
  });
  return NextResponse.json(summary);
}
