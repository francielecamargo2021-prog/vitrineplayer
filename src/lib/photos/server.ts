import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { del, get, put } from "@vercel/blob";
import { asUser, dbReady } from "@/lib/db";
import { PHOTO_BUCKET, PHOTO_LIMIT } from "@/domain/athlete";

/**
 * Fotos dos atletas: arquivo no Vercel Blob PRIVADO, permissão no banco (Neon).
 *
 *  * Quem pode ver/enviar/apagar é decidido SEMPRE pela RLS de storage.objects, consultada
 *    como o próprio usuário (asUser): responsável vinculado, admin, ou profissional
 *    autorizado (atleta aprovado + ativo + não bloqueado para a organização dele).
 *  * O navegador nunca recebe o endereço do Blob nem o token: as fotos são servidas por
 *    /api/fotos/{atleta}/{arquivo}, que confere a permissão a cada pedido.
 *  * Todo arquivo é recodificado aqui (WebP, ≤ 2048 px): metadados como GPS/EXIF são
 *    removidos mesmo que alguém envie direto, sem passar pelo navegador.
 *  * Limite de 12 fotos por atleta, garantido também pelo banco (gatilho de 0002).
 */
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const BLOB_PREFIX = "atletas/";

export function photosReady() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN) && dbReady();
}
const token = () => {
  const t = process.env.BLOB_READ_WRITE_TOKEN;
  if (!t) throw new Error("photos not configured");
  return t;
};

export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
/** Nome do registro: {atleta}/{32 hex}.webp (o mesmo formato que a RLS espera). */
export const isPhotoName = (v: string) => /^[0-9a-f-]{36}\/[0-9a-f]{32}\.webp$/i.test(v);

export class PhotoError extends Error {
  constructor(public code: "full" | "badType" | "tooBig" | "forbidden" | "notFound" | "save") {
    super(code);
  }
}

/** Valida e recodifica a imagem (remove metadados). Recusa o que não for imagem de verdade. */
async function sanitize(input: Buffer) {
  if (input.length > MAX_UPLOAD_BYTES) throw new PhotoError("tooBig");
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    throw new PhotoError("badType");
  }
  if (!format || !["jpeg", "png", "webp"].includes(format)) throw new PhotoError("badType");
  try {
    const { data, info } = await sharp(input, { failOn: "error", limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new PhotoError("badType");
  }
}

/**
 * Remove o registro e o arquivo. O arquivo é apagado pelo caminho conhecido mesmo que o
 * registro já não exista (ex.: atleta excluído durante o envio), para não sobrar órfão.
 */
async function dropObject(userId: string, name: string) {
  await asUser(userId, (q) => q`delete from storage.objects where bucket_id = ${PHOTO_BUCKET} and name = ${name}`)
    .catch((e) => console.error("[fotos] desfazer registro:", (e as Error).message));
  await del(BLOB_PREFIX + name, { token: token() }).catch((e) => console.error("[fotos] desfazer:", (e as Error).message));
}

/**
 * Envia uma foto nova (ou substitui `replaceMediaId`). Ordem segura:
 * 1) banco autoriza e registra (RLS) · 2) arquivo vai para o Blob · 3) galeria é atualizada.
 * Qualquer falha desfaz os passos anteriores.
 */
export async function storePhoto(userId: string, athleteId: string, input: Buffer, replaceMediaId?: string) {
  if (!isUuid(athleteId) || (replaceMediaId && !isUuid(replaceMediaId))) throw new PhotoError("forbidden");
  const img = await sanitize(input);

  const [state] = await asUser<{ mine: boolean; photos: number; has_primary: boolean; old_path: string | null }>(userId, (q) => q`
    select is_my_athlete(${athleteId}::uuid) as mine,
           (select count(*)::int from athlete_media where athlete_id = ${athleteId} and kind = 'photo') as photos,
           exists (select 1 from athlete_media where athlete_id = ${athleteId} and is_primary) as has_primary,
           (select storage_path from athlete_media where id = ${replaceMediaId ?? null}::uuid and athlete_id = ${athleteId} and kind = 'photo') as old_path`);
  if (!state?.mine) throw new PhotoError("forbidden");
  if (replaceMediaId && !state.old_path) throw new PhotoError("notFound");
  if (!replaceMediaId && state.photos >= PHOTO_LIMIT) throw new PhotoError("full");

  const name = `${athleteId}/${randomUUID().replaceAll("-", "")}.webp`;
  const blobPath = BLOB_PREFIX + name;
  try {
    await asUser(userId, (q) => q`insert into storage.objects (bucket_id, name, blob_url) values (${PHOTO_BUCKET}, ${name}, ${blobPath})`);
  } catch (e) {
    console.error("[fotos] registro:", (e as Error).message);
    throw new PhotoError("forbidden");
  }
  try {
    await put(blobPath, img.data, { access: "private", token: token(), contentType: "image/webp", addRandomSuffix: false });
  } catch (e) {
    console.error("[fotos] blob:", (e as Error).message);
    await dropObject(userId, name).catch(() => {});
    throw new PhotoError("save");
  }
  try {
    if (replaceMediaId) {
      const r = await asUser(userId, (q) => q`
        update athlete_media set storage_path = ${name}, width = ${img.width}, height = ${img.height}, focal_x = 0.5, focal_y = 0.5, zoom = 1
         where id = ${replaceMediaId} and athlete_id = ${athleteId} and kind = 'photo' returning id`);
      if (!r.length) throw new PhotoError("notFound");
      await dropObject(userId, state.old_path!).catch(() => {});
    } else {
      await asUser(userId, (q) => q`
        insert into athlete_media (athlete_id, kind, storage_path, width, height, is_primary, position)
        values (${athleteId}, 'photo', ${name}, ${img.width}, ${img.height}, ${!state.has_primary}, ${state.photos})`);
    }
  } catch (e) {
    console.error("[fotos] galeria:", (e as Error).message);
    await dropObject(userId, name).catch((d) => console.error("[fotos] desfazer:", (d as Error).message));
    if (e instanceof PhotoError) throw e;
    throw new PhotoError(/photo limit/.test(String((e as Error).message)) ? "full" : "save");
  }
  return { name };
}

/** Exclui a foto: registro da galeria + registro do arquivo (atômico) e depois o arquivo no Blob. */
export async function removePhoto(userId: string, athleteId: string, mediaId: string) {
  if (!isUuid(athleteId) || !isUuid(mediaId)) throw new PhotoError("forbidden");
  const [r] = await asUser<{ blob_url: string | null; was_primary: boolean | null }>(userId, (q) => q`
    with m as (delete from athlete_media where id = ${mediaId} and athlete_id = ${athleteId} and kind = 'photo' returning storage_path, is_primary),
         o as (delete from storage.objects where bucket_id = ${PHOTO_BUCKET} and name = (select storage_path from m) returning blob_url)
    select (select blob_url from o) as blob_url, (select is_primary from m) as was_primary`);
  if (r?.was_primary === null || r?.was_primary === undefined) throw new PhotoError("notFound");
  if (r.blob_url) await del(r.blob_url, { token: token() }).catch(() => {});
  if (r.was_primary) {
    await asUser(userId, (q) => q`
      select set_primary_photo(id) from athlete_media where athlete_id = ${athleteId} and kind = 'photo' order by position, created_at limit 1`);
  }
}

/** Endereço do arquivo SE o banco permitir ao usuário ver a foto (RLS). `null` = não existe ou não pode ver. */
export async function photoBlobPath(userId: string, name: string) {
  if (!isPhotoName(name)) return null;
  const rows = await asUser<{ blob_url: string | null }>(userId, (q) =>
    q`select blob_url from storage.objects where bucket_id = ${PHOTO_BUCKET} and name = ${name}`);
  return rows[0]?.blob_url ?? null;
}

/** Lê o arquivo de uma foto já autorizada por photoBlobPath(). */
export async function readPhoto(url: string) {
  const blob = await get(url, { access: "private", token: token() }).catch(() => null);
  if (!blob || !blob.stream) return null;
  return blob.stream;
}

/** Endereço interno (mesma origem) pelo qual o navegador pede a foto. */
export const photoUrl = (name: string) => `/api/fotos/${name}`;
