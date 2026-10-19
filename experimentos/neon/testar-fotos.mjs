// Teste das FOTOS PRIVADAS: Vercel Blob privado (arquivo) + registro no banco (quem pode ver).
// Mesmo desenho da futura rota /api/fotos: o servidor verifica o JWT, pergunta ao banco
// COMO O USUÁRIO se a foto é visível (RLS) e só então lê o arquivo privado.
// Imagens fictícias geradas aqui (quadrados coloridos); tudo é apagado no fim.
// Requer BLOB_READ_WRITE_TOKEN do armazenamento vitrineplayer-homolog-fotos (só no ambiente).
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { del, get, head, list, put } from "@vercel/blob";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { connect, env } from "./db.mjs";

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!TOKEN) { console.error("RECUSADO: defina BLOB_READ_WRITE_TOKEN (armazenamento de homologação)."); process.exit(3); }
const STORE = (TOKEN.match(/^vercel_blob_rw_([^_]+)_/) ?? [])[1];
const E = env();
const AUTH = E.NEON_AUTH_URL;
const ORIGIN = "http://localhost:3000";
const PREFIX = "homolog-teste/"; // tudo deste teste fica sob este prefixo
const run = Date.now().toString(36);
const mail = (k) => `vp-teste-foto-${k}-${run}@example.com`;
const PASS = `Teste-${run}-Senha!9`;
let ok = 0, bad = 0;
const check = (c, d, x = "") => { console.log(`${c ? "✓" : "✗"} ${d}${x ? ` — ${x}` : ""}`); c ? ok++ : bad++; };

// PNG fictício 8×8 de uma cor (nenhuma foto real)
function fakePng(r, g, b) {
  const crc = (buf) => { let c = ~0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(8, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: 8 }, () => Buffer.concat([Buffer.from([0]), Buffer.from(Array(8).fill([r, g, b]).flat())])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function authCall(path, body, cookie) {
  const r = await fetch(`${AUTH}${path}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const cookieOut = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json, cookie: cookieOut };
}
async function newUser(k) {
  const s = await authCall("/sign-up/email", { email: mail(k), password: PASS, name: `[TESTE] Foto ${k}` });
  const l = await authCall("/sign-in/email", { email: mail(k), password: PASS });
  const t = await authCall("/token", null, l.cookie);
  return { id: s.json.user.id, jwt: t.json.token };
}

const JWKS = createRemoteJWKSet(new URL(`${AUTH}/.well-known/jwks.json`));
const { client: db } = await connect();
async function asUser(jwt, sql, values) {
  const { payload } = await jwtVerify(jwt, JWKS); // assinatura do Neon Auth conferida no servidor
  await db.query("begin");
  try {
    await db.query({ text: "select set_config('request.jwt.claims', $1, true)", values: [JSON.stringify({ sub: payload.sub, role: "authenticated" })] });
    await db.query("set local role authenticated");
    const r = await db.query({ text: sql, values });
    await db.query("commit");
    return r;
  } catch (e) { await db.query("rollback"); throw e; }
}

// ---------------------------------------------------------------- "rotas" do servidor
/** Upload: o banco autoriza primeiro (RLS da pasta do atleta); só então o arquivo vai para o Blob. */
async function enviarFoto(jwt, athleteId, bytes) {
  const name = `${athleteId}/${randomUUID()}.png`;
  await asUser(jwt, "insert into storage.objects (bucket_id, name) values ('athlete-photos', $1)", [name]);
  try {
    const blob = await put(PREFIX + name, bytes, { access: "private", token: TOKEN, contentType: "image/png", addRandomSuffix: false });
    await asUser(jwt, "update storage.objects set blob_url = $2 where bucket_id = 'athlete-photos' and name = $1", [name, blob.pathname]);
    return name;
  } catch (e) {
    await asUser(jwt, "delete from storage.objects where bucket_id = 'athlete-photos' and name = $1", [name]);
    throw e;
  }
}
/** Leitura: devolve os bytes só se o banco liberar a linha para este usuário; senão "não encontrado". */
async function servirFoto(jwt, name) {
  if (!jwt) return { status: 401 };
  const r = await asUser(jwt, "select blob_url from storage.objects where bucket_id = 'athlete-photos' and name = $1", [name]);
  if (!r.rows.length || !r.rows[0].blob_url) return { status: 404 };
  const blob = await get(r.rows[0].blob_url, { access: "private", token: TOKEN });
  if (!blob || blob.statusCode !== 200) return { status: 404 };
  const bytes = Buffer.from(await new Response(blob.stream).arrayBuffer());
  return { status: 200, bytes, type: blob.blob.contentType };
}
/** Exclusão: o banco decide (RLS); o arquivo só é apagado se a linha foi apagada. */
async function apagarFoto(jwt, name) {
  const r = await asUser(jwt, "delete from storage.objects where bucket_id = 'athlete-photos' and name = $1 returning blob_url", [name]);
  if (!r.rows.length) return false;
  await del(r.rows[0].blob_url, { token: TOKEN });
  return true;
}

const created = { users: [], athletes: [], orgs: [] };
try {
  console.log(`Armazenamento: ${STORE ? `store ${STORE}` : "?"} (privado) · prefixo ${PREFIX}`);
  const A = await newUser("a"), B = await newUser("b"), P = await newUser("p");
  created.users.push(A.id, B.id, P.id);
  const { rows: [{ id: athA }] } = await asUser(A.jwt, "select create_athlete('[TESTE] Atleta Foto', 'Foto', '2011-04-02', 'BR') as id");
  created.athletes.push(athA);
  const img = fakePng(31, 122, 76);

  // upload
  const foto = await enviarFoto(A.jwt, athA, img);
  check(!!foto, "responsável envia foto fictícia para o próprio atleta", foto);
  const h = await head(PREFIX + foto, { token: TOKEN });
  check(h?.size === img.length, "arquivo está no Vercel Blob privado", `${h?.size} bytes`);
  let negado = false;
  try { await enviarFoto(B.jwt, athA, fakePng(200, 0, 0)); } catch { negado = true; }
  const { blobs } = await list({ prefix: `${PREFIX}${athA}/`, token: TOKEN });
  check(negado && blobs.length === 1, "outra família não envia foto para esse atleta (nada chega ao Blob)", `${blobs.length} arquivo(s) na pasta`);

  // acesso
  let r = await servirFoto(A.jwt, foto);
  check(r.status === 200 && Buffer.compare(r.bytes, img) === 0 && r.type === "image/png", "responsável vê a própria foto (bytes idênticos)");
  r = await servirFoto(B.jwt, foto); check(r.status === 404, "outra família não vê a foto", `HTTP ${r.status}`);
  r = await servirFoto(null, foto); check(r.status === 401, "sem login não vê a foto", `HTTP ${r.status}`);
  r = await servirFoto(P.jwt, foto); check(r.status === 404, "profissional não vê foto de atleta ainda não aprovado", `HTTP ${r.status}`);
  const direto = await fetch(h.url);
  check(direto.status === 403 || direto.status === 401, "endereço do Blob sem credencial é recusado (não é público)", `HTTP ${direto.status}`);

  // profissional aprovado + bloqueio
  const { rows: [org] } = await db.query({ text: "insert into organizations (name, kind, country, status) values ($1, 'club', 'BR', 'approved') returning id", values: [`[TESTE] Clube Foto ${run}`] });
  created.orgs.push(org.id);
  await db.query({ text: "update profiles set role = 'PROFESSIONAL' where id = $1", values: [P.id] });
  await db.query({ text: "insert into organization_members (organization_id, profile_id) values ($1, $2)", values: [org.id, P.id] });
  await db.query("begin");
  await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
  await db.query({ text: "update athletes set status = 'approved', approved_at = now() where id = $1", values: [athA] });
  await db.query("commit");
  r = await servirFoto(P.jwt, foto); check(r.status === 200, "profissional de organização aprovada vê a foto do atleta aprovado", `HTTP ${r.status}`);
  await asUser(A.jwt, "insert into athlete_org_blocks (athlete_id, organization_id) values ($1, $2)", [athA, org.id]);
  r = await servirFoto(P.jwt, foto); check(r.status === 404, "depois do bloqueio, a organização não vê mais a foto", `HTTP ${r.status}`);
  await asUser(A.jwt, "update athletes set visibility = 'paused' where id = $1", [athA]);
  await asUser(A.jwt, "delete from athlete_org_blocks where athlete_id = $1", [athA]);
  r = await servirFoto(P.jwt, foto); check(r.status === 404, "perfil pausado esconde a foto de profissionais", `HTTP ${r.status}`);

  // exclusão
  check(!(await apagarFoto(B.jwt, foto)), "outra família não apaga a foto");
  check(!!(await head(PREFIX + foto, { token: TOKEN }).catch(() => null)), "arquivo continua no Blob depois da tentativa indevida");
  check(await apagarFoto(A.jwt, foto), "responsável apaga a própria foto");
  const depois = await head(PREFIX + foto, { token: TOKEN }).catch(() => null);
  check(!depois, "arquivo some do Blob após a exclusão");
  r = await servirFoto(A.jwt, foto); check(r.status === 404, "foto apagada não é mais servida", `HTTP ${r.status}`);
} catch (e) {
  check(false, "erro inesperado", e.message);
} finally {
  await db.query("rollback").catch(() => {});
  const { blobs } = await list({ prefix: PREFIX, token: TOKEN }).catch(() => ({ blobs: [] }));
  if (blobs.length) await del(blobs.map((b) => b.url), { token: TOKEN });
  if (created.athletes.length) await db.query({ text: "delete from storage.objects where (storage.foldername(name))[1] = any($1::text[])", values: [created.athletes] });
  if (created.athletes.length) await db.query({ text: "delete from athletes where id = any($1)", values: [created.athletes] });
  if (created.orgs.length) await db.query({ text: "delete from organizations where id = any($1)", values: [created.orgs] });
  if (created.users.length) await db.query({ text: "delete from audit_log where actor_id = any($1)", values: [created.users] });
  if (created.users.length) await db.query({ text: `delete from neon_auth."user" where id = any($1)`, values: [created.users] });
  const sobra = await list({ prefix: PREFIX, token: TOKEN }).catch(() => ({ blobs: [] }));
  const { rows: [l] } = await db.query(`select (select count(*)::int from neon_auth."user") u, (select count(*)::int from athletes) a, (select count(*)::int from storage.objects) f`);
  console.log(`\nLimpeza: ${sobra.blobs.length} arquivo(s) no Blob; ${l.u} usuários, ${l.a} atletas, ${l.f} registros de foto no banco`);
  await db.end();
  console.log(`Resultado: ${ok} ok, ${bad} falha(s)`);
  process.exitCode = bad ? 1 : 0;
}
