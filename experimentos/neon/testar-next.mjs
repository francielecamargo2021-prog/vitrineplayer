// Navegador real (Chromium) contra o app Next.js mínimo + Neon Auth + Data API.
import { chromium } from "playwright-core";
import { connect } from "./db.mjs";

const BASE = "http://localhost:3210";
const run = Date.now().toString(36);
const email = `vp-teste-next-${run}@example.com`;
const senha = `Teste-${run}-Senha!9`;
let ok = 0, bad = 0;
const check = (c, d, x = "") => { console.log(`${c ? "✓" : "✗"} ${d}${x ? ` — ${x}` : ""}`); c ? ok++ : bad++; };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-proxy-server"] });
const page = await browser.newPage();
try {
  await page.goto(`${BASE}/painel`);
  check(page.url().startsWith(`${BASE}/entrar`), "painel sem login redireciona para /entrar (proxy.ts do Next 16)");

  await page.fill("#cadastro [name=name]", "[TESTE] Família Next");
  await page.fill("#cadastro [name=email]", email);
  await page.fill("#cadastro [name=password]", senha);
  await Promise.all([page.waitForURL(/\/(painel|entrar)/), page.click("#cadastro button")]);
  await page.waitForLoadState("networkidle");
  check(page.url() === `${BASE}/painel`, "cadastro por Server Action leva ao painel", page.url());
  check((await page.textContent("#usuario"))?.trim() === email, "Server Component lê a sessão (auth.getSession)");
  const perfis = JSON.parse((await page.textContent("#perfis")) ?? "[]");
  check(perfis.length === 1 && perfis[0].role === "RESPONSIBLE" && perfis[0].country === "BR" && perfis[0].whatsapp === "+5511999990001",
    "Data API com o JWT da sessão: perfil + dados do complete_signup", JSON.stringify(perfis));
  check((await page.textContent("#consentimentos"))?.trim() === "4", "4 consentimentos gravados no cadastro");
  check((await page.textContent("#atletas"))?.trim() === "0", "RLS: família nova não vê atletas de outros");
  const cookies = await page.context().cookies();
  check(cookies.length > 0 && cookies.every((c) => c.httpOnly), "cookies de sessão são HttpOnly", cookies.map((c) => `${c.name}${c.sameSite ? "/" + c.sameSite : ""}`).join(", "));

  await Promise.all([page.waitForURL(/\/entrar/), page.click("#sair")]);
  check(page.url().startsWith(`${BASE}/entrar`), "sair encerra a sessão");
  await page.goto(`${BASE}/painel`);
  check(page.url().startsWith(`${BASE}/entrar`), "depois de sair, o painel volta a exigir login");

  await page.fill("#login [name=email]", email);
  await page.fill("#login [name=password]", "senha-errada-123");
  await Promise.all([page.waitForURL(/\/entrar\?erro=/), page.click("#login button")]);
  check(await page.isVisible("#erro"), "senha errada mostra erro e não entra");

  await page.fill("#login [name=email]", email);
  await page.fill("#login [name=password]", senha);
  await Promise.all([page.waitForURL(/\/painel/), page.click("#login button")]);
  check((await page.textContent("#usuario"))?.trim() === email, "login por Server Action volta ao painel com a sessão");
} catch (e) {
  check(false, "erro inesperado", e.message.split("\n")[0]);
} finally {
  await browser.close();
  const { client } = await connect();
  await client.query({ text: `delete from audit_log where actor_id in (select id from neon_auth."user" where email = $1)`, values: [email] });
  const { rowCount } = await client.query({ text: `delete from neon_auth."user" where email = $1`, values: [email] });
  const { rows: [l] } = await client.query(`select (select count(*)::int from neon_auth."user") u, (select count(*)::int from profiles) p`);
  console.log(`\nLimpeza: ${rowCount} usuário de teste apagado; restam ${l.u} usuários e ${l.p} perfis`);
  await client.end();
  console.log(`Resultado: ${ok} ok, ${bad} falha(s)`);
  process.exitCode = bad ? 1 : 0;
}
