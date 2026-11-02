import { NextResponse, type NextRequest } from "next/server";
import { applyEvent } from "@/lib/pitchvision/integrator";
import { pvClient, pvConfig } from "@/lib/pitchvision/client";
import { pvRepo } from "@/lib/pitchvision/repo-db";
import { verifySignature } from "@/lib/pitchvision/signature";

/**
 * Avisos da PitchVision (POST assinado com HMAC; ver lib/pitchvision/signature.ts).
 *  * Assinatura inválida ou antiga → 401, nada é lido.
 *  * Cada evento é registrado UMA vez (pv_register_event); repetição → 200 sem efeito.
 *  * O aviso só diz "mudou"; a etapa é sempre confirmada consultando a própria PitchVision (applyEvent).
 *  * Se a gravação falhar, responde 500: a PitchVision tenta de novo, e o ciclo agendado é a reserva.
 */
export const dynamic = "force-dynamic";

const MAX_BODY = 256 * 1024;

export async function POST(req: NextRequest) {
  const cfg = pvConfig();
  const repo = pvRepo();
  const client = pvClient();
  if (!cfg || !repo || !client) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const body = await req.text();
  if (body.length > MAX_BODY) return NextResponse.json({ error: "too large" }, { status: 413 });
  if (!verifySignature(cfg.webhookSecret, req.headers.get("x-pitchvision-signature"), body, Math.floor(Date.now() / 1000))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let ev: { id?: unknown; type?: unknown; data?: unknown };
  try {
    ev = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (typeof ev.id !== "string" || !/^[A-Za-z0-9]{1,32}$/.test(ev.id) || typeof ev.type !== "string" || typeof ev.data !== "object" || !ev.data) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!(await repo.registerEvent(ev.id, ev.type))) return NextResponse.json({ ok: true, duplicate: true });
  const outcome = await applyEvent({ type: ev.type, data: ev.data as Record<string, unknown> }, { repo, client });
  return NextResponse.json({ ok: true, outcome });
}
