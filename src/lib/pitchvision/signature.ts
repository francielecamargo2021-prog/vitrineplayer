import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Assinatura dos avisos da PitchVision: cabeçalho `X-PitchVision-Signature: t=<unix>,v1=<hex>`, com
 * HMAC-SHA256 de `t + "." + corpo` usando o segredo combinado (PITCHVISION_WEBHOOK_SECRET).
 * Recusa assinatura inválida e avisos fora da janela de tempo (proteção contra repetição antiga).
 */
export function signBody(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifySignature(secret: string, header: string | null, body: string, nowSec: number, toleranceSec = 300): boolean {
  if (!secret || secret.length < 32 || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  const v1 = parts.v1 ?? "";
  if (!Number.isInteger(t) || Math.abs(nowSec - t) > toleranceSec || !/^[0-9a-f]{64}$/.test(v1)) return false;
  const expected = Buffer.from(signBody(secret, t, body), "hex");
  const got = Buffer.from(v1, "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Referência opaca do atleta enviada à PitchVision (nunca o id nem o nome). */
export function athleteRef(key: string, athleteId: string): string {
  if (!key || key.length < 32) throw new Error("PITCHVISION_REF_KEY ausente ou curta");
  return "a_" + createHmac("sha256", key).update(athleteId).digest("hex").slice(0, 40);
}
