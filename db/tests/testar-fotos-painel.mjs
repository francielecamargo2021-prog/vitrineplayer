// Teste de ponta a ponta das FOTOS (Etapa 4) num navegador real, contra o app local ligado
// à HOMOLOGAÇÃO: Neon (permissão) + Vercel Blob privado (arquivo).
//
//   VP_ENV=homolog VP_DB_URL_FILE=… BLOB_READ_WRITE_TOKEN=… APP_URL=http://localhost:3300 node db/tests/testar-fotos-painel.mjs
//
// Contas, atletas, organização e fotos FICTÍCIAS (quadrados coloridos gerados aqui), tudo apagado no fim.
import { createHash } from "node:crypto";
import sharp from "sharp";
import { del, head, list } from "@vercel/blob";
import { chromium } from "playwright-core";
import { conectar } from "../conexao.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3300";
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!TOKEN) { console.error("defina BLOB_READ_WRITE_TOKEN"); process.exit(3); }
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const run = Date.now().toString(36);
const mail = (k) => `vp-e2e-${k}-${run}@example.com`;
const PASS = `Teste-${run}-Senha!9`;
const CODE_HASH = createHash("sha256").update("123456").digest("base64url");
const ORG = `Clube Teste [E2E] ${run}`;

let ok = 0, bad = 0;
const check = (c, d, x = "") => { console.log(`${c ? "✓" : "✗"} ${d}${x ? ` — ${x}` : ""}`); c ? ok++ : bad++; };
const section = (t) => console.log(`\n— ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { client } = await conectar();
const q = (t, v) => client.query(v ? { text: t, values: v } : t);

// imagens fictícias: JPEG com GPS no EXIF (para provar que o servidor remove) e PNG
const gpsJpeg = await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#2e7d32" } })
  .jpeg().withExif({ IFD0: { Artist: "teste" }, IFD3: { GPSLatitudeRef: "S", GPSLatitude: "23/1 33/1 0/1" } }).toBuffer();
const png = (c) => sharp({ create: { width: 640, height: 640, channels: 3, background: c } }).png().toBuffer();

const browser = await chromium.launch({ executablePath: CHROME });
async function account(k, name, { signup = true } = {}) {
  const ctx = await browser.newContext({ locale: "pt-BR" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const email = mail(k);
  if (signup) {
    await page.goto(`${APP}/pt/cadastro`);
    await page.fill('input[name="full_name"]', name);
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASS);
    await page.fill('input[name="confirm"]', PASS);
    await page.fill('input[name="whatsapp"]', "+5511999990001");
    await page.selectOption('select[name="country"]', "BR");
    for (const c of ["terms", "privacy", "guardian_declaration", "no_guarantee"]) await page.check(`input[name="${c}"]`);
    await page.locator("main form button").first().click();
    await page.waitForURL(/verificar/);
    for (let i = 0; i < 20; i++) {
      const r = await q(`update neon_auth.verification set value = $1 where identifier = $2`, [`${CODE_HASH}:0`, `email-verification-otp-${email}`]);
      if (r.rowCount) break;
      await sleep(500);
    }
    await page.fill('input[name="code"]', "123456");
    await page.locator("main form button").first().click();
    await page.waitForURL(/\/pt\/painel/);
  }
  const id = signup ? (await q(`select id from neon_auth."user" where email = $1`, [email])).rows[0].id : null;
  /** GET de uma foto pela sessão deste navegador. */
  const fetchPhoto = (url) => page.evaluate(async (u) => {
    const r = await fetch(u);
    const b = new Uint8Array(await r.arrayBuffer());
    return { status: r.status, type: r.headers.get("content-type"), cache: r.headers.get("cache-control"), bytes: Array.from(b) };
  }, url);
  /** POST direto na rota de envio (como um invasor faria, sem passar pela tela). */
  const post = (athleteId, bytes, replace) => page.evaluate(async ({ a, b, r }) => {
    const fd = new FormData();
    fd.set("athleteId", a);
    fd.set("file", new Blob([new Uint8Array(b)]), "x.bin");
    if (r) fd.set("replace", r);
    const res = await fetch("/api/fotos", { method: "POST", body: fd });
    return { status: res.status, body: await res.json().catch(() => null) };
  }, { a: athleteId, b: Array.from(bytes), r: replace });
  return { page, ctx, email, id, fetchPhoto, post };
}
const photos = async (athleteId) => (await q(`select m.id, m.storage_path, m.is_primary, m.position, o.blob_url
  from athlete_media m left join storage.objects o on o.name = m.storage_path where m.athlete_id = $1 and m.kind = 'photo' order by m.position, m.created_at`, [athleteId])).rows;
const blobExists = (path) => head(path, { token: TOKEN }).then(() => true, () => false);

let athleteId = null;
try {
  section("Família A envia fotos pela tela");
  const A = await account("a", "Carla Fotos A");
  await A.page.goto(`${APP}/pt/painel/atleta/novo`);
  await A.page.fill('input[name="full_name"]', `Atleta Fotos ${run}`);
  await A.page.fill('input[name="birth_date"]', `${new Date().getFullYear() - 13}-03-03`);
  await A.page.selectOption('select[name="country"]', "BR");
  await A.page.selectOption('select[name="relation"]', "father");
  await A.page.locator("main form button").first().click();
  await A.page.waitForURL(/editar\/dados/);
  athleteId = A.page.url().match(/atleta\/([0-9a-f-]{36})/)[1];
  await A.page.goto(`${APP}/pt/painel/atleta/${athleteId}/editar/fotos`);
  await A.page.locator('input[type="file"][multiple]').setInputFiles([
    { name: "gps.jpg", mimeType: "image/jpeg", buffer: gpsJpeg },
    { name: "b.png", mimeType: "image/png", buffer: await png("#1565c0") },
  ]);
  await A.page.locator('button:has-text("Adicionar fotos (2)")').click();
  // espera a fila terminar (o botão de envio some) e a galeria ter as 2 fotos no banco
  await A.page.locator('button:has-text("Adicionar fotos (2)")').waitFor({ state: "detached", timeout: 60000 }).catch(() => {});
  let rows = [];
  for (let i = 0; i < 60 && rows.length < 2; i++) { rows = await photos(athleteId); if (rows.length < 2) await sleep(500); }
  check(rows.length === 2, "2 fotos registradas na galeria", String(rows.length));
  check(rows.filter((r) => r.is_primary).length === 1 && rows[0].is_primary, "a primeira vira a foto principal");
  check(rows.every((r) => r.blob_url?.startsWith(`atletas/${athleteId}/`)), "arquivos guardados no Blob privado, na pasta do atleta");
  check((await Promise.all(rows.map((r) => blobExists(r.blob_url)))).every(Boolean), "arquivos existem no Blob");

  section("Visualização: só quem o banco permite");
  const url = `/api/fotos/${rows[0].storage_path}`;
  const mine = await A.fetchPhoto(url);
  check(mine.status === 200 && mine.type === "image/webp", "a família vê a própria foto (WebP)", `HTTP ${mine.status} ${mine.type}`);
  check(/private/.test(mine.cache ?? "") && /no-cache/.test(mine.cache ?? ""), "cache privado e permissão conferida a cada exibição", mine.cache);
  const meta = await sharp(Buffer.from(mine.bytes)).metadata();
  check(!meta.exif && meta.width <= 2048, "GPS/EXIF removidos pelo servidor", `exif=${meta.exif ? "presente" : "ausente"} ${meta.width}x${meta.height}`);
  await A.page.reload();
  await A.page.waitForSelector('img[src^="/api/fotos/"]', { timeout: 30000 }).catch(() => {});
  const imgs = await A.page.evaluate(() => [...document.querySelectorAll("img")].map((i) => i.getAttribute("src")).filter(Boolean));
  check(imgs.some((s) => s.startsWith("/api/fotos/")) && !imgs.some((s) => /blob\.vercel-storage|vercel_blob/.test(s)), "a tela nunca recebe o endereço do Blob nem o token");

  const B = await account("b", "Bruno Fotos B");
  check((await B.fetchPhoto(url)).status === 404, "outra família não vê a foto (404, não revela que existe)");
  const anon = await account("anon", "", { signup: false });
  await anon.page.goto(`${APP}/pt`);
  check((await anon.fetchPhoto(url)).status === 401, "sem login não vê a foto (401)");
  const direct = await fetch(`https://${TOKEN.split("_")[3]}.private.blob.vercel-storage.com/${rows[0].blob_url}`).catch(() => ({ status: 0 }));
  check([401, 403, 404].includes(direct.status), "o arquivo no Blob não abre sem credencial", `HTTP ${direct.status}`);

  section("Envio indevido é barrado no servidor");
  const intruder = await B.post(athleteId, await png("#ff0000"));
  check(intruder.status === 403 && (await photos(athleteId)).length === 2, "outra família não envia foto para o atleta", `HTTP ${intruder.status}`);
  const notImage = await A.post(athleteId, Buffer.from("isto não é uma imagem"));
  check(notImage.status === 400 && (await photos(athleteId)).length === 2, "arquivo que não é imagem é recusado", `HTTP ${notImage.status}`);

  section("Substituir, organizar e excluir");
  const before = (await photos(athleteId))[0];
  await A.page.reload();
  // "Substituir" da foto principal (a primeira) abre o seletor de arquivo
  const chooser = A.page.waitForEvent("filechooser");
  await A.page.locator('button:has-text("Substituir")').first().click();
  await (await chooser).setFiles({ name: "novo.png", mimeType: "image/png", buffer: await png("#ffb300") });
  for (let i = 0; i < 40; i++) {
    rows = await photos(athleteId);
    if (rows.find((r) => r.id === before.id)?.storage_path !== before.storage_path) break;
    await sleep(500);
  }
  const replaced = rows.find((r) => r.id === before.id);
  check(replaced && replaced.storage_path !== before.storage_path, "substituir troca o arquivo e mantém a posição da foto");
  let oldGone = false;
  for (let i = 0; i < 20 && !oldGone; i++) {
    oldGone = !(await blobExists(before.blob_url)) && !(await q(`select 1 from storage.objects where name = $1`, [before.storage_path])).rowCount;
    if (!oldGone) await sleep(500);
  }
  check(oldGone, "o arquivo antigo é apagado do Blob e do banco");
  await A.page.reload();
  await A.page.locator('button:has-text("Definir como principal")').first().click();
  for (let i = 0; i < 30; i++) { rows = await photos(athleteId); if (rows.find((r) => r.is_primary)?.id !== before.id) break; await sleep(500); }
  check(rows.find((r) => r.is_primary)?.id !== before.id, "outra foto vira a principal");
  A.page.once("dialog", (d) => d.accept());
  const toDelete = rows.find((r) => !r.is_primary);
  await A.page.reload();
  await A.page.locator(`li:has(img[src*="${toDelete.storage_path}"]) button:has-text("Excluir")`).click();
  for (let i = 0; i < 40; i++) { rows = await photos(athleteId); if (rows.length === 1) break; await sleep(500); }
  check(rows.length === 1 && !rows.some((r) => r.id === toDelete.id), "excluir remove a foto da galeria");
  check(!(await blobExists(toDelete.blob_url)) && !(await q(`select 1 from storage.objects where name = $1`, [toDelete.storage_path])).rowCount,
    "excluir apaga o arquivo do Blob e o registro");

  section("Limite de 12 fotos");
  let last = null;
  for (let i = rows.length; i < 12; i++) last = await A.post(athleteId, await png(`#${(0x101010 * (i + 1)).toString(16).padStart(6, "0").slice(-6)}`));
  check(last?.status === 200 && (await photos(athleteId)).length === 12, "até 12 fotos são aceitas", String((await photos(athleteId)).length));
  const thirteenth = await A.post(athleteId, await png("#000000"));
  check(thirteenth.status === 409 && thirteenth.body?.error === "full" && (await photos(athleteId)).length === 12, "a 13ª foto é recusada", `HTTP ${thirteenth.status}`);

  section("Admin e profissionais");
  const C = await account("admin", "Admin Fotos");
  await q(`update profiles set role = 'ADMIN' where id = $1`, [C.id]);
  check((await C.fetchPhoto(`/api/fotos/${(await photos(athleteId))[0].storage_path}`)).status === 200, "admin vê a foto para revisar");
  const P = await account("pro", "Pro Fotos");
  await q(`update profiles set role = 'PROFESSIONAL' where id = $1`, [P.id]);
  const org = (await q(`insert into organizations (name, kind, country, status) values ($1, 'club', 'BR', 'approved') returning id`, [ORG])).rows[0].id;
  await q(`insert into organization_members (organization_id, profile_id) values ($1, $2)`, [org, P.id]);
  const photoUrl = `/api/fotos/${(await photos(athleteId))[0].storage_path}`;
  check((await P.fetchPhoto(photoUrl)).status === 404, "profissional não vê foto de atleta ainda não aprovado");
  await q(`begin; select set_config('request.jwt.claims', '{"role":"service_role"}', true);
           update athletes set status = 'approved', approved_at = now() where id = '${athleteId}'; commit;`);
  check((await P.fetchPhoto(photoUrl)).status === 200, "profissional verificado vê a foto do atleta aprovado e ativo");
  await q(`insert into athlete_org_blocks (athlete_id, organization_id, created_by) values ($1, $2, (select profile_id from athlete_guardians where athlete_id = $1 limit 1))`, [athleteId, org]);
  check((await P.fetchPhoto(photoUrl)).status === 404, "organização bloqueada pela família deixa de ver a foto");
  await q(`delete from athlete_org_blocks where athlete_id = $1`, [athleteId]);
  await q(`update athletes set visibility = 'paused' where id = $1`, [athleteId]);
  check((await P.fetchPhoto(photoUrl)).status === 404, "perfil pausado esconde a foto dos profissionais");
} catch (e) {
  check(false, "erro inesperado", e.message.split("\n")[0]);
} finally {
  await browser.close();
  // arquivos de teste no Blob (pastas dos atletas fictícios)
  const ids = (await q(`select g.athlete_id from athlete_guardians g join neon_auth."user" u on u.id = g.profile_id where u.email like 'vp-e2e-%@example.com'`)).rows.map((r) => r.athlete_id);
  for (const id of ids) {
    const { blobs } = await list({ prefix: `atletas/${id}/`, token: TOKEN });
    if (blobs.length) await del(blobs.map((b) => b.url), { token: TOKEN });
  }
  const T = `select id from neon_auth."user" where email like 'vp-e2e-%@example.com'`;
  await q(`delete from audit_log where actor_id in (${T}) or entity_id = any($1::uuid[])`, [ids]);
  await q(`delete from storage.objects where name like any (select id || '/%' from unnest($1::uuid[]) id)`, [ids]);
  await q(`delete from athletes where id = any($1::uuid[])`, [ids]);
  await q(`delete from athlete_org_blocks where created_by in (${T})`);
  const { rowCount } = await q(`delete from neon_auth."user" where id in (${T})`);
  await q(`delete from organizations where name like 'Clube Teste [E2E]%'`);
  const left = (await q(`select (select count(*)::int from neon_auth."user") u, (select count(*)::int from athletes) a, (select count(*)::int from storage.objects) o`)).rows[0];
  const blobsLeft = (await list({ prefix: "atletas/", token: TOKEN })).blobs.length;
  console.log(`\nLimpeza: ${rowCount} contas apagadas · restaram ${left.u} usuários, ${left.a} atletas, ${left.o} registros de foto, ${blobsLeft} arquivos no Blob`);
  await client.end();
}
console.log(`Resultado: ${ok} ok, ${bad} falha(s)`);
process.exit(bad ? 1 : 0);
