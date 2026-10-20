// Teste de ponta a ponta do PAINEL e do ADMIN (Etapa 3) num navegador real, contra o app
// local ligado à HOMOLOGAÇÃO: dados pela Neon Data API com o JWT de cada usuário.
//
//   VP_ENV=homolog VP_DB_URL_FILE=… NEON_AUTH_BASE_URL=… APP_URL=http://localhost:3300 node db/tests/testar-painel.mjs
//
// Contas fictícias vp-e2e-…@example.com e uma organização fictícia [E2E], apagadas no fim.
// Códigos de e-mail: mesma técnica de testar-login.mjs (hash de um código conhecido).
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";
import { conectar } from "../conexao.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3300";
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const run = Date.now().toString(36);
const mail = (k) => `vp-e2e-${k}-${run}@example.com`;
const PASS = `Teste-${run}-Senha!9`;
const CODE = "123456";
const CODE_HASH = createHash("sha256").update(CODE).digest("base64url");
const ORG = `Clube Teste [E2E] ${run}`;

let ok = 0, bad = 0;
const check = (c, d, x = "") => { console.log(`${c ? "✓" : "✗"} ${d}${x ? ` — ${x}` : ""}`); c ? ok++ : bad++; };
const section = (t) => console.log(`\n— ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { client } = await conectar();
const q = (t, v) => client.query(v ? { text: t, values: v } : t);
async function knownCode(email) {
  for (let i = 0; i < 20; i++) {
    const { rowCount } = await q(`update neon_auth.verification set value = $1 where identifier = $2`, [`${CODE_HASH}:0`, `email-verification-otp-${email}`]);
    if (rowCount) return true;
    await sleep(500);
  }
  return false;
}
const athleteOf = async (name) => (await q(`select *, seeking::text[] as seeking from athletes where full_name = $1`, [name])).rows[0];

const browser = await chromium.launch({ executablePath: CHROME });
async function session() {
  const ctx = await browser.newContext({ locale: "pt-BR" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const api = {
    page,
    path: () => new URL(page.url()).pathname,
    has: async (...w) => { const t = (await page.locator("body").innerText()).replace(/\s+/g, " ").toUpperCase(); return w.every((x) => t.includes(x.toUpperCase())); },
    go: async (p) => (await page.goto(APP + p))?.status() ?? 0,
    click: async (sel) => { await Promise.all([page.waitForLoadState("networkidle"), page.locator(sel).first().click()]); await page.waitForTimeout(500); },
    async signup(email, name) {
      await api.go("/pt/cadastro");
      await page.fill('input[name="full_name"]', name);
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', PASS);
      await page.fill('input[name="confirm"]', PASS);
      await page.fill('input[name="whatsapp"]', "+5511999990001");
      await page.selectOption('select[name="country"]', "BR");
      for (const c of ["terms", "privacy", "guardian_declaration", "no_guarantee"]) await page.check(`input[name="${c}"]`);
      await api.click("form button");
      await page.waitForURL(/verificar/);
      await knownCode(email);
      await page.fill('input[name="code"]', CODE);
      await api.click("form button");
      await page.waitForURL(/\/pt\/painel/);
    },
    /** Marca uma opção de Choices (rádio/checkbox escondido) pelo nome e valor. */
    choose: async (name, value) => page.locator(`input[name="${name}"][value="${value}"]`).check({ force: true }),
    /** Salvar e continuar: espera a próxima etapa abrir (ou um aviso aparecer). */
    save: async (next) => {
      const before = page.url();
      await page.locator('main button[name="intent"][value="next"]').first().click();
      if (next) await page.waitForURL(new RegExp(next), { timeout: 20000 }).catch(() => {});
      else await page.waitForURL((u) => u.toString() !== before, { timeout: 20000 }).catch(() => {});
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(300);
    },
    /** Abre uma etapa e espera o formulário estar pronto. */
    step: async (url) => { await page.goto(APP + url); await page.waitForLoadState("networkidle"); await page.locator("main form").first().waitFor(); },
  };
  return api;
}

try {
  await q(`insert into organizations (name, kind, country, status) values ($1, 'agent', 'BR', 'approved')`, [ORG]);
  const A = await session(), B = await session(), C = await session();
  const NAME = `Lucas Teste ${run}`;

  section("Família A: painel com dados reais (Data API)");
  await A.signup(mail("a"), "Carla Teste A");
  check(A.path() === "/pt/painel" && (await A.has("Comece pelo", "atleta")), "painel vazio mostra o convite para cadastrar o atleta", A.path());

  section("Cadastro do atleta e regra da maioridade");
  await A.go("/pt/painel/atleta/novo");
  const minorBirth = `${new Date().getFullYear() - 14}-05-10`;
  await A.page.fill('input[name="full_name"]', NAME);
  await A.page.fill('input[name="sport_name"]', "Lucas");
  await A.page.fill('input[name="birth_date"]', minorBirth);
  await A.page.selectOption('select[name="country"]', "BR");
  await A.page.selectOption('select[name="relation"]', "self");
  await A.click("main form button");
  check(await A.has("menores de 18 anos precisam de um responsável legal"), "menor não pode ser cadastrado como \"eu mesmo\"");
  check(!(await athleteOf(NAME)), "nada foi gravado no banco");
  // o React limpa o formulário após um envio recusado: preenche de novo
  await A.page.fill('input[name="full_name"]', NAME);
  await A.page.fill('input[name="sport_name"]', "Lucas");
  await A.page.fill('input[name="birth_date"]', minorBirth);
  await A.page.selectOption('select[name="country"]', "BR");
  await A.page.selectOption('select[name="relation"]', "mother");
  await A.click("main form button");
  await A.page.waitForURL(/editar\/dados/);
  const ath = await athleteOf(NAME);
  check(Boolean(ath) && A.path().endsWith("/editar/dados"), "menor com a mãe como responsável é cadastrado e abre a etapa 1", A.path());

  section("Etapas do perfil (rascunho progressivo)");
  await A.page.selectOption('select[name="nationality"]', "BR").catch(() => {});
  await A.page.fill('input[name="state"]', "SP").catch(() => {});
  await A.page.fill('input[name="city"]', "Campinas").catch(() => {});
  await A.save("editar/fotos");
  await A.page.waitForTimeout(500);
  const live0 = (await A.page.locator("[aria-live]").allInnerTexts().catch(() => [])).join(" ");
  const dbRow = await athleteOf(NAME);
  console.log(`   (diagnóstico dados: msg="${live0}" estado=${dbRow?.state} cidade=${dbRow?.city})`);
  const live = await A.page.evaluate(() => [...document.querySelectorAll(":invalid")].map((e) => `${e.tagName}:${e.getAttribute("name")}:${e.validationMessage}`).filter((x) => !x.startsWith("FORM")));
  check(A.path().endsWith("/editar/fotos") && (await A.page.locator('[data-testid="fotos-etapa4"]').count()) === 1, "dados pessoais salvos; etapa Fotos mostra o aviso da Etapa 4", `${A.path()} ${live.join(" ")}`);
  await A.step(`/pt/painel/atleta/${ath.id}/editar/fisico`);
  await A.page.fill('input[name="height_cm"]', "158");
  await A.page.fill('input[name="weight_kg"]', "47");
  await A.choose("foot", "left");
  await A.save("editar/futebol");
  await A.page.locator("main form").first().waitFor();
  check(A.path().endsWith("/editar/futebol"), "etapa Físico salva e avança", A.path());
  await A.choose("modality", "futsal");
  await A.choose("primary_position", "RW");
  await A.choose("secondary_positions", "LW");
  await A.page.fill('input[name="current_club"]', "Escolinha Teste");
  await A.save("editar/perfil");
  let row = await athleteOf(NAME);
  check(row.modality === "futsal" && row.primary_position === "RW" && row.height_cm === 158 && row.foot === "left" && row.current_club === "Escolinha Teste",
    "modalidade, posições, clube, altura e pé gravados no banco", `${row.modality} ${row.primary_position} ${row.height_cm} ${row.foot}`);
  await A.step(`/pt/painel/atleta/${ath.id}/editar/disponibilidade`);
  for (const s of ["club", "agent", "school", "scouting_hub"]) await A.choose("seeking", s);
  await A.choose("travel", "yes");
  await A.choose("relocate_state", "open");
  await A.save("editar/videos");
  row = await athleteOf(NAME);
  check(["club", "agent", "school", "scouting_hub"].every((s) => row.seeking.includes(s)) && row.travel === "yes" && row.relocate_state === "open",
    "objetivos (clube, empresário, escolinha, núcleo) e disponibilidade gravados", row.seeking.join(","));

  section("Vídeos do YouTube");
  await A.go(`/pt/painel/atleta/${ath.id}/editar/videos`);
  await A.page.fill('input[name="url"]', "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await A.page.fill('input[name="title"]', "Melhores momentos");
  await A.click('button:has-text("Adicionar vídeo")');
  await A.page.waitForTimeout(1500);
  await A.go(`/pt/painel/atleta/${ath.id}/editar/videos`);
  check((await A.page.locator('[data-testid="videos-contagem"]').innerText()).trim() === "1 / 20", "vídeo adicionado (contador 1 / 20)");
  await A.page.fill('input[name="url"]', "https://exemplo.com/nao-e-youtube");
  await A.click('button:has-text("Adicionar vídeo")');
  check(await A.has("Link do YouTube inválido"), "link que não é do YouTube é recusado");

  section("Privacidade: ocultar o perfil de uma organização");
  await A.go(`/pt/painel/atleta/${ath.id}/editar/privacidade`);
  await A.page.locator('input[placeholder="…"]').fill(ORG.slice(0, 18));
  await A.page.waitForTimeout(1500);
  await A.page.locator(`li:has-text("${ORG}") button`).first().click();
  await A.page.waitForTimeout(1500);
  const blocks = (await q(`select count(*)::int n from athlete_org_blocks b join organizations o on o.id = b.organization_id where b.athlete_id = $1 and o.name = $2`, [ath.id, ORG])).rows[0].n;
  check(blocks === 1, "organização ocultada (bloqueio gravado no banco)");

  section("Publicação gratuita");
  await A.go(`/pt/painel/atleta/${ath.id}/editar/publicacao`);
  check(await A.has("Gratuito", "Enviar para análise"), "etapa de publicação é gratuita, sem pagamento");
  check(!(await A.has("R$ 59,90")) && !(await A.has("Seguir para pagamento")), "nenhum preço nem pagamento no painel");
  await A.click('button:has-text("Enviar para análise")');
  row = await athleteOf(NAME);
  check(row.status === "in_review" && row.submitted_at, "perfil enviado para análise", row.status);
  await A.go(`/pt/painel/atleta/${ath.id}/editar/publicacao`);
  check(await A.has("Perfil em análise"), "painel mostra 'em análise'");

  section("Pré-visualização e painel com o atleta");
  await A.go(`/pt/painel/atleta/${ath.id}`);
  check(await A.has("Lucas", "Futsal", "Escolinha Teste"), "ficha mostra nome, modalidade e clube");
  await A.go("/pt/painel");
  check(await A.has("Lucas"), "painel lista o atleta da família");

  section("Maior de idade administra o próprio perfil");
  await A.go("/pt/painel/atleta/novo");
  await A.page.fill('input[name="full_name"]', `Adulto Teste ${run}`);
  await A.page.fill('input[name="birth_date"]', `${new Date().getFullYear() - 20}-01-15`);
  await A.page.selectOption('select[name="country"]', "BR");
  await A.page.selectOption('select[name="relation"]', "self");
  await A.click("main form button");
  await A.page.waitForURL(/editar\/dados/).catch(() => {});
  const self = (await q(`select g.relation::text from athlete_guardians g join athletes a on a.id = g.athlete_id where a.full_name = $1`, [`Adulto Teste ${run}`])).rows[0];
  check(self?.relation === "self", "atleta maior de 18 cadastrado como o próprio responsável");

  section("Família B não vê nada da família A");
  await B.signup(mail("b"), "Bruno Teste B");
  check(await B.has("Comece pelo"), "painel de B começa vazio");
  for (const p of [`/pt/painel/atleta/${ath.id}`, `/pt/painel/atleta/${ath.id}/editar/dados`]) {
    const s = await B.go(p);
    check(s === 404 || (await B.has("404")), `B não abre ${p.replace(ath.id, "<atleta de A>")}`, `HTTP ${s}`);
  }
  check(!(await B.has(NAME)), "o nome do atleta de A não aparece para B");

  section("Admin revisa e aprova");
  await C.signup(mail("admin"), "Admin Teste");
  await q(`update profiles set role = 'ADMIN' where id = (select id from neon_auth."user" where email = $1)`, [mail("admin")]);
  await C.go("/pt/admin");
  check(C.path() === "/pt/admin" && (await C.has("Atletas aguardando revisão")), "admin vê o painel de revisão com contadores");
  await C.go("/pt/admin/atletas?situacao=in_review");
  check(await C.has(NAME), "atleta enviado aparece na fila de revisão");
  await C.go(`/pt/admin/atletas/${ath.id}`);
  const adminTxt = (await C.page.locator("body").innerText()).replace(/\s+/g, " ");
  check(await C.has("Lucas", "Carla Teste A", "visível só para administradores"), "admin vê o atleta e o responsável (contato só para o admin)");
  await C.click('button[name="decision"][value="approve"]');
  await C.page.waitForTimeout(1500);
  row = await athleteOf(NAME);
  check(row.status === "approved", "admin aprova pelo painel", row.status);
  const audit = (await q(`select count(*)::int n from audit_log where entity_id = $1 and action like 'athlete.review.%'`, [ath.id])).rows[0].n;
  check(audit >= 1, "aprovação registrada na auditoria");

  section("Visibilidade controlada pela família");
  await A.go(`/pt/painel/atleta/${ath.id}/editar/publicacao`);
  await A.page.locator('input[name="visibility"][value="paused"]').check();
  await A.click('button:has-text("Salvar")');
  row = await athleteOf(NAME);
  check(row.visibility === "paused", "família pausa o perfil aprovado", row.visibility);

  section("Espanhol");
  await A.go("/es/painel");
  check(await A.has("Hola,"), "/es/painel em espanhol");
  await A.go(`/es/painel/atleta/${ath.id}/editar/publicacao`);
  check(await A.has("Gratis"), "/es publicação gratuita em espanhol");

  section("Landing intacta");
  await A.go("/pt");
  check(await A.has("QUALQUER", "LUGAR.", "CADASTRAR ATLETA"), "/pt landing com hero e botão");
} catch (e) {
  check(false, "erro inesperado", e.message.split("\n")[0]);
} finally {
  await browser.close();
  // a auditoria não tem exclusão em cascata (ver pendência "exclusão de conta", Etapa 7)
  await q(`delete from audit_log where actor_id in (select id from neon_auth."user" where email like 'vp-e2e-%@example.com')
           or entity_id in (select a.id from athletes a join athlete_guardians g on g.athlete_id = a.id
                            join neon_auth."user" u on u.id = g.profile_id where u.email like 'vp-e2e-%@example.com')`);
  await q(`delete from athletes where id in (select g.athlete_id from athlete_guardians g join neon_auth."user" u on u.id = g.profile_id where u.email like 'vp-e2e-%@example.com')`);
  await q(`delete from athlete_org_blocks where created_by in (select id from neon_auth."user" where email like 'vp-e2e-%@example.com')`);
  const { rowCount } = await q(`delete from neon_auth."user" where email like 'vp-e2e-%@example.com'`);
  await q(`delete from athletes a where not exists (select 1 from athlete_guardians g where g.athlete_id = a.id)`);
  await q(`delete from organizations where name like 'Clube Teste [E2E]%'`);
  await q(`delete from neon_auth.verification where identifier like '%vp-e2e-%@example.com'`);
  const left = (await q(`select (select count(*)::int from neon_auth."user") u, (select count(*)::int from athletes) a, (select count(*)::int from organizations) o`)).rows[0];
  console.log(`\nLimpeza: ${rowCount} contas de teste apagadas · restaram ${left.u} usuários, ${left.a} atletas, ${left.o} organizações`);
  await client.end();
}
console.log(`Resultado: ${ok} ok, ${bad} falha(s)`);
process.exit(bad ? 1 : 0);
