import "server-only";
import { randomUUID } from "node:crypto";
import { del, head, issueSignedToken, presignUrl } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import type { VideoSigner } from "@/lib/pitchvision/integrator";

/**
 * Vídeos para análise: Blob PRIVADO separado das fotos (BLOB_VIDEO_READ_WRITE_TOKEN).
 *  * O navegador recebe só um token de envio limitado a UM caminho (analises/{atleta}/{aleatório}.ext),
 *    a um tipo e a um tamanho, válido por 6 h. Nunca recebe o token do Blob nem endereço de leitura.
 *  * A PitchVision recebe só uma URL ASSINADA de leitura, temporária (24 h), sem cache de CDN.
 */
export const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/x-matroska": "mkv",
};
export const MAX_VIDEO_BYTES = 15 * 1024 ** 3;
export const UPLOAD_TOKEN_MS = 6 * 60 * 60 * 1000;

const token = () => {
  const t = process.env.BLOB_VIDEO_READ_WRITE_TOKEN;
  if (!t) throw new Error("vídeos não configurados");
  return t;
};
export const videosReady = () => Boolean(process.env.BLOB_VIDEO_READ_WRITE_TOKEN);

export const isVideoPath = (athleteId: string, p: string) =>
  new RegExp(`^analises/${athleteId}/[0-9a-f]{32}\\.(mp4|mov|webm|mkv)$`).test(p);

export function newVideoPath(athleteId: string, contentType: string) {
  const ext = VIDEO_TYPES[contentType];
  if (!ext) throw new Error("tipo de vídeo não aceito");
  return `analises/${athleteId}/${randomUUID().replace(/-/g, "")}.${ext}`;
}

/** Token de envio para UM arquivo (o responsável já foi conferido pelo chamador). */
export async function uploadToken(pathname: string, contentType: string, size: number) {
  const validUntil = Date.now() + UPLOAD_TOKEN_MS;
  const clientToken = await generateClientTokenFromReadWriteToken({
    token: token(), pathname, allowedContentTypes: [contentType], maximumSizeInBytes: size,
    validUntil, addRandomSuffix: false, allowOverwrite: false,
  });
  return { clientToken, validUntil };
}

/** Confere o arquivo enviado (existe, tamanho e tipo esperados) antes de registrá-lo no banco. */
export async function verifyUploaded(pathname: string, size: number, contentType: string) {
  try {
    const h = await head(pathname, { token: token() });
    return h.size === size && h.contentType === contentType;
  } catch {
    return false;
  }
}

export async function deleteVideo(pathname: string) {
  await del(pathname, { token: token() });
}

export const blobSigner: VideoSigner = {
  async presignGet(pathname: string, validForMs: number) {
    const validUntil = Date.now() + validForMs;
    const t = await issueSignedToken({ pathname, operations: ["get"], validUntil, token: token() });
    const { presignedUrl } = await presignUrl(t, { operation: "get", pathname, access: "private", validUntil, useCache: false });
    return presignedUrl;
  },
};
