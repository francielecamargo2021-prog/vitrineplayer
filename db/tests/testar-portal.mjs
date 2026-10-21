// Teste de ponta a ponta do PORTAL DOS PROFISSIONAIS num navegador real, contra o app local
// ligado à HOMOLOGAÇÃO: cadastro profissional → verificação pelo admin → busca → ficha →
// favoritos → listas → interesse → decisão da família (aceitar, bloquear, denunciar).
//
//   VP_ENV=homolog VP_DB_URL_FILE=… APP_URL=http://localhost:3300 node db/tests/testar-portal.mjs
//
// Contas vp-e2e-…@example.com, atleta e organização fictícios, tudo apagado no fim.
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";
import { conectar } from "../conexao.mjs";
import { adminSecondFactor } from "./lib/segundo-fator.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3300";
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const run = Date.now().toString(36);
const mail = (k) => `vp-e2e-${k}-${run}@example.com`;
const PASS = `Teste-${run}-Senha!9`;
const CODE = "123456";
const CODE_HASH = createHash("sha256").update(CODE).digest("base64url");
const ORG = `Olheira Teste [E2E] ${run}`;
const FULL = `Lucas Sobrenomesecreto ${run}`;
const SPORT = `Lukinha${run.slice(-3)}`;

let ok = 0, bad = 0;
const check = (c, d, x = "") => { console.log(`${c ? "✓" : "✗"} ${d}${x ? ` — ${x}` : ""}`); c ? ok++ : bad++; };
const section = (t) => console.log(`\n— ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// SHOTS=<pasta>: guarda capturas de tela (desktop e celular) das telas principais
const shot = async (page, name) => {
  if (!process.env.SHOTS) return;
  await page.screenshot({ path: `${process.env.SHOTS}/${name}-desktop.png`, fullPage: true });
  const vp = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${process.env.SHOTS}/${name}-mobile.png`, fullPage: true });
  await page.setViewportSize(vp);
};
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(400); } return v; };

const { client } = await conectar();
const q = (t, v) => client.query(v ? { text: t, values: v } : t);
const settingsBefore = (await q(`select profile_views_per_day, interests_per_month, interest_expiry_days from portal_settings`)).rows[0];
async function knownCode(email) {
  // o Neon Auth grava o código depois de enviar o e-mail (remetente gratuito compartilhado):
  // às vezes leva mais de 10 s, por isso a espera vai até 30 s
  for (let i = 0; i < 60; i++) {
    const { rowCount } = await q(`update neon_auth.verification set value = $1 where identifier = $2`, [`${CODE_HASH}:0`, `email-verification-otp-${email}`]);
    if (rowCount) return true;
    await sleep(500);
  }
  return false;
}

const browser = await chromium.launch({ executablePath: CHROME });
async function session() {
  const ctx = await browser.newContext({ locale: "pt-BR" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const api = {
    page,
    path: () => new URL(page.url()).pathname,
    text: async () => (await page.locator("body").innerText()).replace(/\s+/g, " "),
    html: () => page.content(),
    has: async (...w) => { const t = (await api.text()).toUpperCase(); return w.every((x) => t.includes(x.toUpperCase())); },
    go: async (p) => (await page.goto(APP + p))?.status() ?? 0,
    click: async (sel) => { await Promise.all([page.waitForLoadState("networkidle"), page.locator(sel).first().click()]); await page.waitForTimeout(600); },
    async verify(email, to) {
      await page.waitForURL(/verificar/);
      await knownCode(email);
      await page.fill('input[name="code"]', CODE);
      await api.click("main form button");
      await page.waitForURL(to);
    },
    async guardianSignup(email, name) {
      await api.go("/pt/cadastro");
      await page.fill('input[name="full_name"]', name);
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', PASS);
      await page.fill('input[name="confirm"]', PASS);
      await page.fill('input[name="whatsapp"]', "+5511977770001");
      await page.selectOption('select[name="country"]', "BR");
      for (const c of ["terms", "privacy", "guardian_declaration", "no_guarantee"]) await page.check(`input[name="${c}"]`);
      await api.click("main form button");
      await api.verify(email, /\/pt\/painel/);
    },
  };
  return api;
}

try {
  const G = await session(), P = await session(), A = await session(), X = await session();

  // ---------------------------------------------------------------- família e atleta aprovado
  section("Família cadastra o atleta (aprovado pela equipe)");
  await G.guardianSignup(mail("familia"), "Marta Familia");
  await G.go("/pt/painel/atleta/novo");
  await G.page.fill('input[name="full_name"]', FULL);
  await G.page.fill('input[name="sport_name"]', SPORT);
  await G.page.fill('input[name="birth_date"]', `${new Date().getFullYear() - 14}-02-02`);
  await G.page.selectOption('select[name="country"]', "BR");
  await G.page.selectOption('select[name="relation"]', "mother");
  await G.click("main form button");
  await G.page.waitForURL(/editar\/dados/);
  const ath = (await q(`select id from athletes where full_name = $1`, [FULL])).rows[0];
  await q(`begin; select set_config('request.jwt.claims', '{"role":"service_role"}', true);
           update athletes set primary_position = 'ST', category = 'Sub-15', modality = 'field', state = 'Minas Gerais', city = 'Cidadesecreta',
                  status = 'approved', approved_at = now() where id = '${ath.id}'; commit;`);
  await q(`insert into athlete_media (athlete_id, kind, url, external_id, title) values ($1, 'youtube', 'https://www.youtube.com/watch?v=abcdefghijk', 'abcdefghijk', 'Gols da temporada')`, [ath.id]);
  check(Boolean(ath), "atleta menor cadastrado e aprovado");

  // ---------------------------------------------------------------- cadastro profissional
  section("Cadastro profissional e verificação");
  check((await P.go("/pt/profissional")) === 200 && (await P.has("Cadastrar organização", "Demonstração com dados fictícios")), "página pública chama para o cadastro (demo mantida)");
  await shot(P.page, "01-profissional");
  await P.go("/pt/profissional/cadastro");
  await shot(P.page, "02-cadastro-profissional");
  await P.page.fill('input[name="full_name"]', "Paula Olheira");
  await P.page.fill('input[name="email"]', mail("pro"));
  await P.page.fill('input[name="password"]', PASS);
  await P.page.fill('input[name="confirm"]', PASS);
  await P.page.fill('input[name="whatsapp"]', "+5511966660001");
  await P.page.selectOption('select[name="country"]', "BR");
  await P.page.selectOption('select[name="kind"]', "scout");
  await P.page.fill('input[name="org_name"]', ORG);
  await P.page.fill('input[name="contact_role"]', "Olheira autônoma");
  await P.page.fill('input[name="document"]', "123.456.789-00");
  await P.page.selectOption('select[name="org_country"]', "BR");
  await P.page.fill('input[name="state"]', "SP");
  await P.page.fill('input[name="website"]', "paula.example");
  for (const c of ["terms", "privacy", "pro_conduct"]) await P.page.check(`input[name="${c}"]`);
  await P.click("main form button");
  check(P.path() === "/pt/profissional/cadastro" && (await P.page.locator('input[name="website"]:invalid').count()) === 1, "site inválido é barrado antes do envio");
  check((await P.page.inputValue('input[name="org_name"]')) === ORG, "formulário mantém os dados após o erro");
  await P.page.fill('input[name="website"]', "https://paula.example");
  await P.page.fill('input[name="password"]', PASS);
  await P.page.fill('input[name="confirm"]', PASS);
  await P.click("main form button");
  await P.verify(mail("pro"), /\/pt\/portal/);
  const org = (await q(`select o.id, o.status, o.kind, p.role from organizations o join organization_members m on m.organization_id = o.id
                         join profiles p on p.id = m.profile_id where o.name = $1`, [ORG])).rows[0];
  check(org?.status === "pending" && org?.kind === "scout" && org?.role === "PROFESSIONAL", "organização pendente e conta profissional", JSON.stringify(org));
  check(await P.page.locator('[data-testid="portal-pendente"]').count() === 1 && (await P.has("Em", "verificação")), "antes da aprovação: só o aviso de verificação");
  check(!(await P.has(SPORT)), "nenhum atleta aparece para organização pendente");
  await shot(P.page, "03-em-verificacao");
  await P.go(`/pt/portal/atleta/${ath.id}`);
  check(!(await P.has(SPORT)) && (await P.page.locator('[data-testid="ficha-atleta"]').count()) === 0, "nem pela ficha direta");

  section("Admin verifica a organização");
  await A.guardianSignup(mail("admin"), "Admin Portal");
  await q(`update profiles set role = 'ADMIN' where id = (select id from neon_auth."user" where email = $1)`, [mail("admin")]);
  await adminSecondFactor(A.page, APP);
  await A.go("/pt/admin/organizacoes?situacao=pending");
  check(await A.has(ORG, "123.456.789-00", "Olheira autônoma", mail("pro"), "https://paula.example"), "admin vê documento, responsável, contato e site");
  await shot(A.page, "04-admin-organizacoes");
  const row = A.page.locator("li", { hasText: ORG });
  await Promise.all([A.page.waitForLoadState("networkidle"), row.locator('button[name="decision"][value="approve"]').click()]);
  check(await until(async () => (await q(`select status from organizations where id = $1`, [org.id])).rows[0].status === "approved"), "admin aprova");

  // ---------------------------------------------------------------- busca e ficha
  section("Busca e exposição mínima");
  await P.go("/pt/portal");
  check(await P.has("Buscar", "atletas") && (await P.has(SPORT)), "busca mostra o atleta aprovado pelo nome esportivo");
  await shot(P.page, "05-busca");
  let html = await P.html();
  check(!html.includes("Sobrenomesecreto") && !html.includes("Cidadesecreta") && !html.includes(mail("familia")) && !html.includes("977770001"),
    "sobrenome, cidade e contato da família não chegam ao navegador do profissional");
  await P.go("/pt/portal?posicao=GK");
  check(!(await P.has(SPORT)), "filtro de posição (goleiro) tira o atacante");
  await P.go("/pt/portal?posicao=ST&idade_min=13&idade_max=15&estado=minas+gerais");
  check(await P.has(SPORT), "filtros de posição, idade e estado encontram o atleta");
  await P.go(`/pt/portal/atleta/${ath.id}`);
  check((await P.page.locator('[data-testid="nome-atleta"]').innerText()).trim().toUpperCase() === SPORT.toUpperCase(), "ficha mostra só o nome esportivo do menor");
  html = await P.html();
  check(!html.includes("Sobrenomesecreto") && !html.includes("Cidadesecreta") && !html.includes("-02-02") && !html.includes(mail("familia")),
    "ficha sem sobrenome, cidade, data de nascimento ou contato");
  check(await P.has("Gols da temporada", "Minas Gerais"), "ficha mostra vídeo e estado");
  await shot(P.page, "06-ficha");
  check(await until(async () => (await q(`select count(*)::int n from athlete_views where athlete_id = $1 and kind = 'view'`, [ath.id])).rows[0].n >= 1),
    "abrir a ficha gera o sinal de visualização para a família");

  section("Favoritos e listas privadas");
  await P.page.locator('main button[aria-pressed]').first().click();
  check(await until(async () => (await q(`select count(*)::int n from pro_favorites where athlete_id = $1`, [ath.id])).rows[0].n === 1), "favoritar pela ficha");
  await P.go("/pt/portal/favoritos");
  check(await P.has(SPORT), "favorito aparece na aba Favoritos");
  await P.go("/pt/portal/listas");
  await P.page.fill('input[name="name"]', "Atacantes Sub-15");
  await P.click("main form button");
  check(await P.has("Atacantes Sub-15"), "cria lista privada");
  await P.go(`/pt/portal/atleta/${ath.id}`);
  await P.page.locator('label:has-text("Atacantes Sub-15") input[type="checkbox"]').check();
  check(await until(async () => (await q(`select count(*)::int n from pro_list_items where athlete_id = $1`, [ath.id])).rows[0].n === 1), "adiciona o atleta à lista");
  const listId = (await q(`select id from pro_lists where name = 'Atacantes Sub-15' and organization_id = $1`, [org.id])).rows[0].id;
  await P.go(`/pt/portal/listas/${listId}`);
  check(await P.has(SPORT), "lista mostra o atleta");

  section("Interesse (a família decide)");
  await P.go(`/pt/portal/atleta/${ath.id}`);
  await P.page.fill('textarea[name="message"]', "Me liga no 11 98888-7777 para conversarmos");
  await P.click('[data-testid="interesse"] button');
  check(await P.has("Retire telefone, e-mail ou links"), "mensagem com telefone é recusada");
  await P.page.fill('textarea[name="message"]', "Gostamos muito do seu jogo e queremos convidar para uma avaliação.");
  await P.click('[data-testid="interesse"] button');
  check(await until(async () => (await P.has("Interesse enviado")) || (await P.page.locator('[data-testid="interesse-status"]').count()) === 1),
    "interesse enviado (a ficha passa a mostrar o status)");
  const req = (await q(`select id, status from contact_requests where athlete_id = $1`, [ath.id])).rows;
  check(req.length === 1 && req[0].status === "requested", "um pedido registrado");
  await P.go("/pt/portal/interesses");
  check(await P.has("Aguardando a família"), "profissional acompanha o status");

  section("Família recebe, aceita, bloqueia e denuncia");
  await G.go("/pt/painel");
  check(await G.has("1 interesse(s) aguardando a sua decisão"), "painel avisa o interesse pendente");
  await G.go("/pt/painel/interesses");
  check(await G.has(ORG, "Olheiro", "Gostamos muito do seu jogo"), "família vê organização e mensagem");
  check(!(await G.has(mail("pro"))), "contato da organização só depois de aceitar");
  await shot(G.page, "07-familia-interesses");
  await G.click('button:has-text("Aceitar e ver o contato")');
  check(await until(async () => (await G.page.locator('[data-testid="contato-org"]').count()) === 1) && (await G.has(mail("pro"))), "ao aceitar, a família recebe o contato oficial da organização");
  await P.go("/pt/portal/interesses");
  check(await P.has("Aceito — a família entrará em contato"), "profissional vê só que foi aceito");
  await shot(P.page, "08-interesses-enviados");
  check(!(await P.has(mail("familia"))) && !(await P.has("977770001")), "nenhum dado da família liberado ao profissional");
  G.page.once("dialog", (d) => d.accept());
  await G.click('button:has-text("Bloquear esta organização")');
  check(await until(async () => (await q(`select count(*)::int n from athlete_org_blocks where athlete_id = $1 and organization_id = $2`, [ath.id, org.id])).rows[0].n === 1),
    "família bloqueia a organização");
  await G.click('button:has-text("Denunciar")');
  await G.page.fill('textarea[name="reason"]', "Insistiu em contato fora da plataforma");
  await G.click('button:has-text("Enviar denúncia")');
  check(await until(async () => (await q(`select reported_at from contact_requests where id = $1`, [req[0].id])).rows[0].reported_at !== null), "família denuncia");
  await P.go("/pt/portal");
  check(!(await P.has(SPORT)), "bloqueada, a organização não encontra mais o atleta");
  await P.go(`/pt/portal/atleta/${ath.id}`);
  check((await P.page.locator('[data-testid="indisponivel"]').count()) === 1, "nem abre a ficha");
  await P.go("/pt/portal/favoritos");
  check(!(await P.has(SPORT)), "e o atleta some dos favoritos");
  await P.go("/pt/portal/interesses");
  check(await P.has("Atleta indisponível") && !(await P.has("Insistiu")), "profissional não vê a denúncia");
  await A.go("/pt/admin/organizacoes?situacao=approved");
  check(await A.has(ORG, "1 denúncia(s) de famílias"), "admin vê que a organização foi denunciada");
  await A.go("/pt/admin/denuncias");
  check(await A.has(ORG, "Insistiu em contato fora da plataforma"), "e o motivo na fila de denúncias");

  section("Limites configuráveis e áreas separadas");
  await A.go("/pt/admin/configuracoes");
  await A.page.fill('input[name="views"]', "120");
  await A.click('button:has-text("Salvar limites")');
  check(await until(async () => (await q(`select profile_views_per_day from portal_settings`)).rows[0].profile_views_per_day === 120), "admin ajusta o limite diário de fichas");
  await G.go("/pt/portal");
  check(G.path() === "/pt/painel", "família não entra no portal profissional", G.path());
  await P.go("/pt/painel");
  check(P.path() === "/pt/portal", "profissional não entra no painel da família", P.path());
  check((await P.go("/pt/admin")) === 404, "profissional não abre o admin");
  await X.go("/pt/portal");
  check(X.path() === "/pt/entrar", "sem login, o portal pede para entrar", X.path());
  await A.go("/pt/admin/organizacoes?situacao=approved");
  const row2 = A.page.locator("li", { hasText: ORG });
  await row2.locator('textarea[name="note"]').fill("Documento vencido");
  await Promise.all([A.page.waitForLoadState("networkidle"), row2.locator('button[name="decision"][value="suspend"]').click()]);
  check(await until(async () => (await q(`select status from organizations where id = $1`, [org.id])).rows[0].status === "suspended"), "admin suspende a organização (com motivo)");
  await P.go("/pt/portal");
  check(await P.has("Acesso", "suspenso", "Documento vencido"), "organização suspensa vê o motivo e perde o acesso");
} catch (e) {
  check(false, "erro inesperado", e.message.split("\n")[0]);
} finally {
  await browser.close();
  const users = `(select id from neon_auth."user" where email like 'vp-e2e-%@example.com')`;
  await q(`update portal_settings set profile_views_per_day = $1, interests_per_month = $2, interest_expiry_days = $3, updated_by = null`,
    [settingsBefore.profile_views_per_day, settingsBefore.interests_per_month, settingsBefore.interest_expiry_days]);
  await q(`delete from audit_log where actor_id in ${users}
           or entity_id in (select a.id from athletes a join athlete_guardians g on g.athlete_id = a.id where g.profile_id in ${users})
           or entity_id in (select organization_id from organization_members where profile_id in ${users})`);
  await q(`delete from contact_requests where requested_by in ${users}`);
  await q(`delete from athlete_views where viewer_id in ${users}`);
  await q(`delete from athletes where id in (select athlete_id from athlete_guardians where profile_id in ${users})`);
  await q(`delete from athlete_org_blocks where created_by in ${users}`);
  await q(`delete from organizations where id in (select organization_id from organization_members where profile_id in ${users}) or name like '%[E2E]%'`);
  const { rowCount } = await q(`delete from neon_auth."user" where email like 'vp-e2e-%@example.com'`);
  await q(`delete from athletes a where not exists (select 1 from athlete_guardians g where g.athlete_id = a.id)`);
  await q(`delete from neon_auth.verification where identifier like '%vp-e2e-%@example.com'`);
  const left = (await q(`select (select count(*)::int from neon_auth."user") u, (select count(*)::int from athletes) a, (select count(*)::int from organizations) o,
                               (select count(*)::int from contact_requests) c, (select profile_views_per_day from portal_settings) v`)).rows[0];
  console.log(`\nLimpeza: ${rowCount} contas de teste apagadas · restaram ${left.u} usuários, ${left.a} atletas, ${left.o} organizações, ${left.c} interesses · limite diário ${left.v}`);
  await client.end();
}
console.log(`Resultado: ${ok} ok, ${bad} falha(s)`);
process.exit(bad ? 1 : 0);
