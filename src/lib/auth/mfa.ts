import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { asService, asUser } from "@/lib/db";

/**
 * Segundo fator dos administradores (TOTP, RFC 6238: 6 dígitos, passos de 30 s).
 *
 *  * O segredo de cada admin é cifrado (AES-256-GCM) com ADMIN_MFA_KEY, que existe só
 *    no servidor. O banco guarda o texto cifrado (0010) e não consegue lê-lo sozinho.
 *  * Código certo → o servidor abre uma sessão de segundo fator no banco (8 h) e grava o
 *    token num cookie HttpOnly. Cada consulta de admin leva esse token (claim vp_mfa);
 *    sem ele, o banco não reconhece o papel ADMIN.
 *  * 5 erros seguidos → 15 minutos de espera; o mesmo código não vale duas vezes;
 *    10 códigos de recuperação de uso único.
 */
export const MFA_COOKIE = "vp_admin_mfa";
const STEP = 30;
const ISSUER = "VitrinePlayer";

function key(): Buffer | null {
  const raw = process.env.ADMIN_MFA_KEY ?? "";
  const buf = Buffer.from(raw, "base64url");
  return buf.length === 32 ? buf : null;
}
/** Servidor configurado para o segundo fator (sem a chave, a área de admin fica fechada). */
export const mfaReady = () => key() !== null;

const sha256 = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");

function encrypt(plain: string) {
  const k = key();
  if (!k) throw new Error("ADMIN_MFA_KEY ausente");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}
function decrypt(box: string) {
  const k = key();
  const [v, iv, tag, enc] = box.split(".");
  if (!k || v !== "v1" || !iv || !tag || !enc) throw new Error("segredo ilegível");
  const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
}

// ---------------------------------------------------------------- TOTP
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(s: string) {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    const i = B32.indexOf(ch);
    if (i < 0) continue;
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
export function totp(secretB32: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secretB32)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}
/** Passo aceito (tolerância de ±1 passo para relógios fora de hora) ou null. */
function matchStep(secretB32: string, code: string, now = Date.now()) {
  const cur = Math.floor(now / 1000 / STEP);
  for (const s of [cur, cur - 1, cur + 1]) {
    const a = Buffer.from(totp(secretB32, s)), b = Buffer.from(code.padEnd(6).slice(0, 6));
    if (a.length === b.length && timingSafeEqual(a, b)) return s;
  }
  return null;
}

// ---------------------------------------------------------------- estado e sessões
type MfaState = { enrolled: boolean; pending: boolean; secret_enc: string | null; locked_until: string | null; last_step: number | null; recovery_left: number };

export async function mfaState(userId: string) {
  const [r] = await asService<{ s: MfaState }>((q) => q`select mfa_state(${userId}::uuid) as s`);
  return r.s;
}

export async function mfaToken() {
  try {
    return (await cookies()).get(MFA_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/** O banco confirma a prova do segundo fator desta requisição. */
export async function mfaVerified(userId: string) {
  const token = await mfaToken();
  if (!token) return false;
  const [r] = await asUser<{ ok: boolean }>(userId, (q) => q`select mfa_verified() as ok`, { mfa: token });
  return Boolean(r?.ok);
}

async function openCookie(token: string) {
  (await cookies()).set(MFA_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 8 * 60 * 60,
  });
}

/** Começa (ou refaz) o cadastro: novo segredo cifrado no banco + URI para o aplicativo autenticador. */
export async function beginEnroll(userId: string, email: string) {
  const secret = base32Encode(randomBytes(20));
  const verified = await mfaVerified(userId);
  await asService((q) => q`select mfa_begin_enroll(${userId}::uuid, ${encrypt(secret)}, ${verified})`);
  const label = encodeURIComponent(`${ISSUER}:${email}`);
  return { secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=${ISSUER}&algorithm=SHA1&digits=6&period=${STEP}` };
}

/** Segredo do cadastro pendente (para mostrar de novo o QR enquanto não confirmado). */
export async function pendingSecret(userId: string, email: string) {
  const s = await mfaState(userId);
  if (!s.pending || !s.secret_enc) return null;
  const secret = decrypt(s.secret_enc);
  const label = encodeURIComponent(`${ISSUER}:${email}`);
  return { secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=${ISSUER}&algorithm=SHA1&digits=6&period=${STEP}` };
}

export type MfaResult = { ok: true; recovery?: string[]; ticket?: string } | { ok: false; error: "code" | "locked" | "reused" | "setup" };

/**
 * Na ativação, o cookie só é gravado depois que o admin confirma que guardou os códigos
 * de recuperação (gravar cookie atualiza a página e esconderia os códigos). O token da
 * sessão viaja cifrado com a chave do servidor, vale 10 minutos e só serve ao mesmo usuário.
 */
function sealTicket(userId: string, token: string) {
  return encrypt(JSON.stringify({ u: userId, t: token, at: Date.now() }));
}
export async function finishEnrollment(userId: string, ticket: string) {
  let data: { u: string; t: string; at: number };
  try {
    data = JSON.parse(decrypt(ticket));
  } catch {
    return false;
  }
  if (data.u !== userId || Date.now() - data.at > 10 * 60 * 1000) return false;
  const [r] = await asUser<{ ok: boolean }>(userId, (q) => q`select mfa_verified() as ok`, { mfa: data.t });
  if (!r?.ok) return false;
  await openCookie(data.t);
  return true;
}

/** Confere o código; certo → sessão de 8 h. No primeiro uso, ativa o fator e gera os 10 códigos de recuperação. */
export async function verifyCode(userId: string, code: string): Promise<MfaResult> {
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "code" };
  const s = await mfaState(userId);
  if (!s.secret_enc) return { ok: false, error: "setup" };
  if (s.locked_until && new Date(s.locked_until) > new Date()) return { ok: false, error: "locked" };
  const step = matchStep(decrypt(s.secret_enc), code);
  if (step === null) {
    const [r] = await asService<{ s: { locked_until: string | null } }>((q) => q`select mfa_register_failure(${userId}::uuid) as s`);
    return { ok: false, error: r.s.locked_until && new Date(r.s.locked_until) > new Date() ? "locked" : "code" };
  }
  if (s.last_step !== null && step <= Number(s.last_step)) return { ok: false, error: "reused" };
  const token = randomBytes(32).toString("base64url");
  let recovery: string[] | undefined;
  if (!s.enrolled) {
    recovery = Array.from({ length: 10 }, () => {
      const r = randomBytes(5).toString("hex");
      return `${r.slice(0, 5)}-${r.slice(5)}`;
    });
  }
  await asService((q) => q`select mfa_open_session(${userId}::uuid, ${step}, ${sha256(token)}, ${recovery ? recovery.map(sha256) : null}::text[])`);
  if (recovery) return { ok: true, recovery, ticket: sealTicket(userId, token) };
  await openCookie(token);
  return { ok: true };
}

export async function redeemRecoveryCode(userId: string, code: string): Promise<MfaResult & { left?: number }> {
  const clean = code.trim().toLowerCase();
  if (!/^[0-9a-f]{5}-[0-9a-f]{5}$/.test(clean)) return { ok: false, error: "code" };
  const token = randomBytes(32).toString("base64url");
  try {
    const [r] = await asService<{ left: number }>((q) => q`select mfa_use_recovery(${userId}::uuid, ${sha256(clean)}, ${sha256(token)}) as left`);
    await openCookie(token);
    return { ok: true, left: r.left };
  } catch (e) {
    const m = String((e as Error).message);
    if (/locked/.test(m)) return { ok: false, error: "locked" };
    await asService((q) => q`select mfa_register_failure(${userId}::uuid)`).catch(() => {});
    return { ok: false, error: "code" };
  }
}

/** Sair: encerra a sessão de segundo fator no banco e apaga o cookie. */
export async function closeMfa() {
  const token = await mfaToken();
  if (!token) return;
  await asService((q) => q`select mfa_close_session(${sha256(token)})`).catch(() => {});
  try {
    (await cookies()).delete(MFA_COOKIE);
  } catch {
    /* fora de uma ação: o cookie expira sozinho */
  }
}
