// Teste de ponta a ponta das funcionalidades A, B1, B2, C1–C5 e D1 (PLANO-FUNCIONALIDADES)
// num navegador real, contra o app local ligado à HOMOLOGAÇÃO. A IA real fica desligada.
//
//   VP_ENV=homolog VP_DB_URL_FILE=… APP_URL=http://localhost:3300 node db/tests/testar-funcionalidades.mjs
//
// Contas vp-e2e-…@example.com, atleta e organização fictícios, tudo apagado no fim.
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";
import { conectar } from "../conexao.mjs";
import { totp } from "./lib/segundo-fator.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3300";
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const run = Date.now().toString(36);
const mail = (k) => `vp-e2e-${k}-${run}@example.com`;
const PASS = `Teste-${run}-Senha!9`;
const CODE = "123456";
const CODE_HASH = createHash("sha256").update(CODE).digest("base64url");
const ORG = `Olheiros Teste [E2E] ${run}`;
const FULL = `Rafael Sobrenomeoculto ${run}`;
const SPORT = `Rafinha${run.slice(-3)}`;

let ok = 0, bad = 0;
const check = (c, d, x = "") => { console.log(`${c ? "✓" : "✗"} ${d}${x ? ` — ${x}` : ""}`); c ? ok++ : bad++; };
const section = (t) => console.log(`\n— ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const one = async (t, v) => (await q(t, v)).rows[0];
async function knownCode(email) {
  for (let i = 0; i < 60; i++) {
    const { rowCount } = await q(`update neon_auth.verification set value = $1 where identifier = $2`, [`${CODE_HASH}:0`, `email-verification-otp-${email}`]);
    if (rowCount) return true;
    await sleep(500);
  }
  return false;
}

const browser = await chromium.launch({ executablePath: CHROME });
async function session() {
  const ctx = await browser.newContext({ locale: "pt-BR", acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const api = {
    page, ctx,
    path: () => new URL(page.url()).pathname,
    has: async (...w) => { const t = (await page.locator("body").innerText()).replace(/\s+/g, " ").toUpperCase(); return w.every((x) => t.includes(x.toUpperCase())); },
    go: async (p) => (await page.goto(APP + p))?.status() ?? 0,
    click: async (sel) => { await Promise.all([page.waitForLoadState("networkidle"), page.locator(sel).first().click()]); await page.waitForTimeout(700); },
    fetchJson: (url) => page.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, body: r.ok ? await r.json() : null }; }, url),
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
      await page.fill('input[name="whatsapp"]', "+5511955550001");
      await page.selectOption('select[name="country"]', "BR");
      for (const c of ["terms", "privacy", "guardian_declaration", "no_guarantee"]) await page.check(`input[name="${c}"]`);
      await api.click("main form button");
      await api.verify(email, /\/pt\/painel/);
    },
    async login(email) {
      await api.go("/pt/entrar");
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', PASS);
      await api.click("main form button");
    },
    async logout() { await api.click('header form button:has-text("Sair")'); },
  };
  return api;
}

try {
  const G = await session(), P = await session(), A = await session(), M = await session();

  // ================================================================ preparação
  section("Preparação: família, atleta aprovado e olheiro aprovado");
  await G.guardianSignup(mail("familia"), "Marta Funcional");
  await G.go("/pt/painel/atleta/novo");
  await G.page.fill('input[name="full_name"]', FULL);
  await G.page.fill('input[name="sport_name"]', SPORT);
  await G.page.fill('input[name="birth_date"]', `${new Date().getFullYear() - 15}-04-04`);
  await G.page.selectOption('select[name="country"]', "BR");
  await G.page.selectOption('select[name="relation"]', "mother");
  await G.click("main form button");
  await G.page.waitForURL(/editar\/dados/);
  const ath = await one(`select id from athletes where full_name = $1`, [FULL]);
  await q(`begin; select set_config('request.jwt.claims', '{"role":"service_role"}', true);
           update athletes set primary_position = 'ST', category = 'Sub-15', modality = 'field', state = 'Bahia', status = 'approved', approved_at = now() where id = '${ath.id}'; commit;`);
  await q(`insert into athlete_media (athlete_id, kind, url, external_id, title, video_type) values ($1, 'youtube', 'https://www.youtube.com/watch?v=abcdefghijk', 'abcdefghijk', 'Gols 2026', 'highlights')`, [ath.id]);
  const video = await one(`select id from athlete_media where athlete_id = $1 and external_id = 'abcdefghijk'`, [ath.id]);

  await P.go("/pt/profissional/cadastro");
  await P.page.fill('input[name="full_name"]', "Otávio Olheiro");
  await P.page.fill('input[name="email"]', mail("pro"));
  await P.page.fill('input[name="password"]', PASS);
  await P.page.fill('input[name="confirm"]', PASS);
  await P.page.fill('input[name="whatsapp"]', "+5511944440001");
  await P.page.selectOption('select[name="country"]', "BR");
  await P.page.selectOption('select[name="kind"]', "scout");
  await P.page.fill('input[name="org_name"]', ORG);
  await P.page.fill('input[name="contact_role"]', "Olheiro");
  await P.page.fill('input[name="document"]', "987.654.321-00");
  await P.page.selectOption('select[name="org_country"]', "BR");
  for (const c of ["terms", "privacy", "pro_conduct"]) await P.page.check(`input[name="${c}"]`);
  await P.click("main form button");
  await P.verify(mail("pro"), /\/pt\/portal/);
  const org = await one(`select o.id from organizations o where o.name = $1`, [ORG]);
  await q(`update organizations set status = 'approved' where id = $1`, [org.id]);
  check(Boolean(ath && video && org), "dados de partida prontos");

  // ================================================================ C4: segundo fator do admin
  section("Segundo fator do administrador");
  await A.guardianSignup(mail("admin"), "Ana Admin");
  const adminId = (await one(`select id from neon_auth."user" where email = $1`, [mail("admin")])).id;
  await q(`update profiles set role = 'ADMIN' where id = $1`, [adminId]);
  await A.go("/pt/admin");
  check(A.path() === "/pt/entrar/segundo-fator", "sem segundo fator, /admin leva à configuração", A.path());
  await A.click('button:has-text("Gerar QR code")');
  check((await A.page.locator('svg').count()) > 0 && (await A.page.locator('[data-testid="mfa-chave"]').count()) === 1, "QR code e chave para digitar aparecem");
  const secret = (await A.page.locator('[data-testid="mfa-chave"]').innerText()).trim();
  await shot(A.page, "01-segundo-fator");
  const enc = (await one(`select secret_enc from admin_mfa where profile_id = $1`, [adminId])).secret_enc;
  check(!enc.includes(secret) && enc.startsWith("v1."), "segredo guardado cifrado no banco (nunca em texto puro)");
  await A.page.fill('input[name="code"]', totp(secret) === "000000" ? "111111" : "000000");
  await A.click('main form button:has-text("Confirmar")');
  check(await A.has("Código inválido"), "código errado é recusado");
  await A.page.fill('input[name="code"]', totp(secret));
  await A.click('main form button:has-text("Confirmar")');
  const codes = await A.page.locator('[data-testid="codigos-recuperacao"] li').allInnerTexts();
  check(codes.length === 10, "10 códigos de recuperação mostrados uma vez", String(codes.length));
  await Promise.all([A.page.waitForURL(/\/pt\/admin$/), A.page.locator('button:has-text("ir para o admin")').click()]);
  check(await A.has("Visão geral", "Denúncias abertas"), "admin entra com o segundo fator");
  await shot(A.page, "02-admin-inicio");
  await A.logout();
  await A.login(mail("admin"));
  await A.page.waitForURL(/segundo-fator/);
  check(A.path() === "/pt/entrar/segundo-fator" && !(await A.has("Gerar QR code")), "novo acesso pede só o código (fator já configurado)");
  await A.page.fill('input[name="recovery"]', codes[0]);
  await Promise.all([A.page.waitForURL(/\/pt\/admin$/), A.page.locator('button:has-text("Usar código de recuperação")').click()]);
  check(A.path() === "/pt/admin", "código de recuperação libera o admin");
  check((await one(`select cardinality(recovery_hashes) n from admin_mfa where profile_id = $1`, [adminId])).n === 9, "e é de uso único (restam 9)");

  // ================================================================ C1–C3: telas do admin
  section("Admin: busca, contas, organizações, IA, configurações, avisos e auditoria");
  await A.go(`/pt/admin/busca?q=${encodeURIComponent("Marta Funcional")}`);
  check(await A.has("Marta Funcional", "Conta"), "busca encontra a conta pelo nome");
  await A.go("/pt/admin/contas?papel=RESPONSIBLE");
  check(await A.has("Marta Funcional", mail("familia")), "lista de responsáveis com contato (só admin)");
  const gId = (await one(`select id from neon_auth."user" where email = $1`, [mail("familia")])).id;
  await A.go(`/pt/admin/contas/${gId}`);
  check(await A.has(SPORT, "responsável único", "terms"), "detalhe da conta mostra atletas e consentimentos");
  await shot(A.page, "03-admin-conta");
  await A.go("/pt/admin/organizacoes?situacao=approved&tipo=scout");
  check(await A.has(ORG, "987.654.321-00"), "organizações por tipo (olheiro)");
  await A.go(`/pt/admin/organizacoes/${org.id}`);
  check(await A.has("Equipe (1/5)", "Otávio Olheiro", "Uso do portal"), "detalhe da organização com equipe e uso");
  await A.go("/pt/admin/ia");
  check((await A.page.locator('[data-testid="ia-status"]').innerText()).includes("IA desligada"), "console da IA mostra a IA desligada");
  await shot(A.page, "04-admin-ia");
  await A.go("/pt/admin/configuracoes");
  check(await A.has("Limites do portal profissional", "Equipe por organização"), "configurações do portal");
  await A.go("/pt/admin/auditoria?acao=admin.mfa");
  check(await A.has("Segundo fator configurado", "Código de recuperação usado"), "auditoria registra o segundo fator");

  // ================================================================ D1: IA por crédito (sem pagamento), relatório no portal
  section("IA: crédito, fila e relatório publicado no portal");
  await G.go(`/pt/painel/atleta/${ath.id}/editar/avaliacao`);
  await G.page.locator('input[name="media_id"]').first().check({ force: true });
  await G.page.fill('input[name="video_minutes"]', "5");
  await G.page.fill('input[name="shirt_number"]', "9");
  await G.page.fill('input[name="shirt_color"]', "azul");
  await G.page.selectOption('select[name="position"]', "ST");
  await G.page.check('input[name="consent"]');
  check(await G.has("compra de análises ainda não está disponível"), "texto novo: créditos, sem pagamento do cadastro");
  await G.click('main button:has-text("Solicitar avaliação")');
  check(await G.has("não tem crédito de análise"), "sem crédito, o pedido é recusado com mensagem clara");
  await A.go(`/pt/admin/atletas/${ath.id}`);
  const aiBox = A.page.locator('[data-testid="ia-atleta"]');
  await aiBox.locator('textarea[name="note"]').fill("Cortesia para o teste");
  await Promise.all([A.page.waitForLoadState("networkidle"), aiBox.locator("button").click()]);
  check(await until(async () => (await one(`select count(*)::int n from ai_analysis_grants where athlete_id = $1`, [ath.id])).n === 1), "admin concede cortesia de análise");
  await G.go(`/pt/painel/atleta/${ath.id}/editar/avaliacao`);
  await G.page.locator('input[name="media_id"]').first().check({ force: true });
  await G.page.fill('input[name="video_minutes"]', "5");
  await G.page.fill('input[name="shirt_number"]', "9");
  await G.page.fill('input[name="shirt_color"]', "azul");
  await G.page.selectOption('select[name="position"]', "ST");
  await G.page.check('input[name="consent"]');
  await G.click('main button:has-text("Solicitar avaliação")');
  const req = await until(async () => one(`select id, status from ai_analysis_requests where athlete_id = $1`, [ath.id]));
  check(req?.status === "queued", "com crédito, o pedido entra direto na fila", req?.status);
  check((await one(`select enabled from ai_settings`)).enabled === false, "IA real continua desligada");
  await A.go("/pt/admin/ia");
  check(await A.has(SPORT, "Na fila"), "console da IA mostra o pedido na fila");
  // simula o resultado (a IA real está desligada) e a família publica pela tela
  await q(`update ai_analysis_requests set status = 'completed', completed_at = now() where id = $1`, [req.id]);
  await q(`insert into ai_video_reports (request_id, athlete_id, media_id, video_type, position, position_group, rubric_version, model, overall_score, coverage, confidence, summary, strengths, report)
           values ($1, $2, $3, 'highlights', 'ST', 'st', 'rubric-2026.10-v1', 'simulado', 3.5, 0.7, 'medium', 'Movimentação inteligente na área.', array['Finalização de primeira'],
           '{"version":1,"rubric_version":"rubric-2026.10-v1","prompt_version":"simulado","model":"simulado","video":{"youtube_id":"abcdefghijk","type":"highlights","start_s":0,"end_s":300,"segments":1},"criteria":[],"overall_score":3.5,"coverage":0.7,"confidence":"medium"}')`, [req.id, ath.id, video.id]);
  const rep = await one(`select id from ai_video_reports where request_id = $1`, [req.id]);
  await q(`insert into ai_report_scores (report_id, athlete_id, criterion, score, confidence, evidence_count) values ($1, $2, 'finishing', 4, 'medium', 3)`, [rep.id, ath.id]);
  await P.go(`/pt/portal/atleta/${ath.id}`);
  check((await P.page.locator('[data-testid="relatorio-ia"]').count()) === 0, "relatório não publicado não aparece ao profissional");
  await G.go(`/pt/painel/atleta/${ath.id}/avaliacao`);
  await G.click('button:has-text("Publicar na vitrine")');
  await P.go(`/pt/portal/atleta/${ath.id}`);
  check(await P.has("Movimentação inteligente na área.", "Finalização"), "publicado pela família, o relatório aparece na ficha do profissional");

  // ================================================================ B1: área de trabalho
  section("Área de trabalho do profissional");
  await P.page.selectOption('[data-testid="etapa"]', "watching");
  check(await until(async () => (await one(`select stage from pro_tracking where athlete_id = $1`, [ath.id]))?.stage === "watching"), "etapa \"Observando\"");
  await P.page.fill('[data-testid="nova-nota"] textarea[name="body"]', "Ataca bem a profundidade; rever o jogo completo");
  await P.page.fill('[data-testid="nova-nota"] input[name="tags"]', "rever video, observar ao vivo");
  await P.click('[data-testid="nova-nota"] button');
  check(await until(async () => (await one(`select count(*)::int n from pro_notes where athlete_id = $1`, [ath.id])).n === 1)
    && await until(async () => P.has("Ataca bem a profundidade", "rever video"), 10000), "nota privada com etiquetas");
  const form = P.page.locator('[data-testid="nova-avaliacao"]');
  await form.locator('input[name="s_finishing"][value="4"]').check({ force: true });
  await form.locator('input[name="s_off_ball_movement"][value="3"]').check({ force: true });
  await form.locator('select[name="media"]').selectOption(video.id);
  await form.locator('input[name="minute"]').fill("2");
  await form.locator('textarea[name="observation"]').fill("Finaliza de primeira com a esquerda");
  await P.click('[data-testid="nova-avaliacao"] button:has-text("Salvar avaliação")');
  const ev = await until(async () => one(`select scores, position_group, media_id from scout_evaluations where athlete_id = $1`, [ath.id]));
  check(ev?.scores?.finishing === 4 && ev?.position_group === "st" && ev?.media_id === video.id, "avaliação pela rubrica do atacante (1–5) com vídeo citado", JSON.stringify(ev?.scores));
  check(await until(async () => (await one(`select stage from pro_tracking where athlete_id = $1`, [ath.id]))?.stage === "evaluated"), "funil avança sozinho para \"Avaliado\"");
  await P.go(`/pt/portal/atleta/${ath.id}`);
  check(await P.has("Finaliza de primeira com a esquerda", "Histórico da organização com o atleta", "Avaliação"), "avaliação e linha do tempo na ficha");
  await shot(P.page, "05-portal-ficha-trabalho");
  await P.go("/pt/portal/acompanhamento?etapa=evaluated");
  check(await P.has(SPORT, "Avaliado (1)"), "aba Acompanhamento lista por etapa");
  await shot(P.page, "06-portal-acompanhamento");
  await q(`update athlete_views set viewed_at = now() - interval '1 hour' where athlete_id = $1`, [ath.id]);
  await q(`insert into athlete_media (athlete_id, kind, url, external_id, title) values ($1, 'youtube', 'https://www.youtube.com/watch?v=bbbbbbbbbbb', 'bbbbbbbbbbb', 'Novo vídeo')`, [ath.id]);
  await P.go("/pt/portal");
  check((await P.page.locator('[data-testid="atualizado"]').count()) >= 1, "busca marca o atleta como \"Atualizado\" (vídeo novo)");

  // ================================================================ B2: equipe por convite
  section("Equipe por convite");
  await P.go("/pt/portal/equipe");
  await P.click('[data-testid="convite"] button');
  const link = await P.page.locator('[data-testid="link-convite"]').inputValue();
  check(/\/pt\/profissional\/convite\/[0-9a-f]{64}$/.test(link), "dono gera convite de uso único");
  await M.page.goto(link);
  check(await M.has(ORG), "convidado vê a organização antes de aceitar");
  await M.page.fill('input[name="full_name"]', "Mila Colega");
  await M.page.fill('input[name="email"]', mail("colega"));
  await M.page.fill('input[name="password"]', PASS);
  await M.page.fill('input[name="confirm"]', PASS);
  await M.page.fill('input[name="whatsapp"]', "+5511933330001");
  await M.page.selectOption('select[name="country"]', "BR");
  for (const c of ["terms", "privacy", "pro_conduct"]) await M.page.check(`input[name="${c}"]`);
  await M.click("main form button");
  await M.verify(mail("colega"), /\/pt\/portal/);
  check(await M.has("Buscar", "atletas"), "colega entra direto no portal da organização");
  await M.go(`/pt/portal/atleta/${ath.id}`);
  check(await M.has("Ataca bem a profundidade") && (await M.page.locator('[data-testid="notas"] button:has-text("Apagar")').count()) === 0, "colega vê a nota da equipe, mas não apaga a de outra pessoa");
  await M.page.goto(link);
  check((await M.page.locator('[data-testid="convite-invalido"]').count()) === 1 || M.path() === "/pt/painel" || M.path() === "/pt/portal", "convite não vale de novo");
  await P.go("/pt/portal/equipe");
  check(await P.has("Mila Colega", "Otávio Olheiro"), "dono vê a equipe");
  await shot(P.page, "07-portal-equipe");
  await P.page.locator('li', { hasText: "Mila Colega" }).locator('button:has-text("Remover")').click();
  check(await until(async () => (await one(`select count(*)::int n from organization_members where organization_id = $1`, [org.id])).n === 1), "dono remove a colega");
  await M.go("/pt/portal");
  check((await M.page.locator('[data-testid="portal-pendente"]').count()) === 1 && !(await M.has(SPORT)), "colega removida perde o acesso aos atletas");

  // ================================================================ C1: correção e moderação
  section("Admin: pedido de correção e moderação de mídia");
  await A.go(`/pt/admin/atletas/${ath.id}`);
  const corr = A.page.locator('[data-testid="pedir-correcao"]');
  await corr.locator('textarea[name="note"]').fill("Informe a altura e o pé dominante");
  await Promise.all([A.page.waitForLoadState("networkidle"), corr.locator("button").click()]);
  await G.go("/pt/painel");
  check(await until(async () => { await G.page.reload(); return G.has("Informe a altura e o pé dominante"); }, 10000), "família vê o pedido de correção no painel");
  await G.click('[data-testid="pedido-correcao"] button');
  check(!(await G.has("Informe a altura e o pé dominante")), "família marca como resolvido");
  await A.go(`/pt/admin/atletas/${ath.id}`);
  const media = A.page.locator('[data-testid="midia"]', { hasText: "Novo vídeo" });
  await media.locator('textarea[name="note"]').fill("Vídeo com dados pessoais à mostra");
  await Promise.all([A.page.waitForLoadState("networkidle"), media.locator('button:has-text("Remover")').click()]);
  check(await until(async () => (await one(`select count(*)::int n from athlete_media where athlete_id = $1 and external_id = 'bbbbbbbbbbb'`, [ath.id])).n === 0), "admin remove o vídeo impróprio");
  await G.go("/pt/painel");
  check(await G.has("Vídeo removido pela equipe", "dados pessoais à mostra"), "família recebe o aviso com o motivo");
  await shot(G.page, "08-painel-aviso");

  // ================================================================ C2: denúncia e interesses
  section("Admin: denúncias e interesses");
  await P.go(`/pt/portal/atleta/${ath.id}`);
  await P.page.fill('textarea[name="message"]', "Gostaríamos de convidar para uma avaliação presencial.");
  await P.click('[data-testid="interesse"] button');
  await until(async () => (await one(`select count(*)::int n from contact_requests where athlete_id = $1`, [ath.id])).n === 1);
  check((await one(`select stage from pro_tracking where athlete_id = $1`, [ath.id])).stage === "interest", "funil avança para \"Interesse enviado\"");
  await A.go("/pt/admin/interesses?situacao=requested");
  check(await A.has(ORG, SPORT, "convidar para uma avaliação"), "admin vê os interesses aguardando a família");
  await G.go("/pt/painel/interesses");
  await G.click('button:has-text("Denunciar")');
  await G.page.fill('textarea[name="reason"]', "Mensagem insistente");
  await G.click('button:has-text("Enviar denúncia")');
  await A.go("/pt/admin/denuncias");
  check(await A.has(ORG, "Mensagem insistente"), "denúncia na fila do admin");
  await shot(A.page, "09-admin-denuncias");
  const rep2 = A.page.locator('[data-testid="fila-denuncias"] li').first();
  await rep2.locator('textarea[name="note"]').fill("Organização orientada; sem reincidência");
  await Promise.all([A.page.waitForLoadState("networkidle"), rep2.locator('button:has-text("Resolver")').click()]);
  check(await until(async () => (await one(`select report_status from contact_requests where athlete_id = $1`, [ath.id])).report_status === "resolved"), "admin resolve a denúncia com registro");

  // ================================================================ C1: suspensão de conta
  section("Admin: suspensão de conta");
  await A.go(`/pt/admin/contas/${gId}`);
  const susp = A.page.locator('[data-testid="suspender-conta"]');
  await susp.locator('textarea[name="note"]').fill("Teste de suspensão");
  await Promise.all([A.page.waitForLoadState("networkidle"), susp.locator('button:has-text("Suspender")').click()]);
  await until(async () => (await one(`select suspended_at from profiles where id = $1`, [gId])).suspended_at !== null);
  await G.go("/pt/painel");
  check(G.path() === "/pt/entrar/suspensa" && (await G.has("Conta", "suspensa")), "conta suspensa vê o aviso, não o painel", G.path());
  await A.go(`/pt/admin/contas/${gId}`);
  await Promise.all([A.page.waitForLoadState("networkidle"), A.page.locator('[data-testid="suspender-conta"] button:has-text("Reativar")').click()]);
  await until(async () => (await one(`select suspended_at from profiles where id = $1`, [gId])).suspended_at === null);
  await G.go("/pt/painel");
  check(G.path() === "/pt/painel", "reativada, volta ao painel");

  // ================================================================ C5: LGPD
  section("LGPD: exportar e excluir");
  await G.go("/pt/painel/conta");
  await shot(G.page, "10-minha-conta");
  const exp = await G.fetchJson("/api/conta/exportar");
  check(exp.status === 200 && exp.body?.account?.email === mail("familia") && exp.body?.athletes?.[0]?.sport_name === SPORT, "família baixa os próprios dados (JSON)");
  check(!JSON.stringify(exp.body).includes("review_note"), "sem notas internas do admin");
  const proId = (await one(`select id from neon_auth."user" where email = $1`, [mail("pro")])).id;
  const aexp = await A.fetchJson(`/api/admin/exportar/${proId}`);
  check(aexp.status === 200 && aexp.body?.organizations?.[0]?.name === ORG, "admin exporta os dados de uma conta a pedido");
  check((await G.fetchJson(`/api/admin/exportar/${proId}`)).status === 404, "família não exporta dados de terceiros");
  await G.page.fill('[data-testid="excluir-conta"] input[name="confirm"]', "outro@example.com");
  await G.click('[data-testid="excluir-conta"] button');
  check(await G.has("não confere"), "exclusão exige confirmar o próprio e-mail");
  await G.page.fill('[data-testid="excluir-conta"] input[name="confirm"]', mail("familia"));
  await G.click('[data-testid="excluir-conta"] button');
  await G.page.waitForURL(/\/pt(\?|$)/).catch(() => {});
  check(await until(async () => (await one(`select count(*)::int n from neon_auth."user" where email = $1`, [mail("familia")])).n === 0), "conta da família excluída");
  check((await one(`select count(*)::int n from athletes where id = $1`, [ath.id])).n === 0, "atleta sob responsabilidade única excluído (com vídeos, relatório e interesses)");
  check((await one(`select count(*)::int n from pro_notes where athlete_id = $1`, [ath.id])).n === 0, "notas da organização sobre o atleta também saem");
  await G.login(mail("familia"));
  check(await G.has("E-mail ou senha incorretos"), "login antigo não funciona mais");
  const mId = (await one(`select id from neon_auth."user" where email = $1`, [mail("colega")])).id;
  await A.go(`/pt/admin/contas/${mId}`);
  const del = A.page.locator('[data-testid="excluir-conta-admin"]');
  await del.locator('textarea[name="note"]').fill("Pedido por e-mail");
  await del.locator('input[name="confirm"]').fill("EXCLUIR");
  await Promise.all([A.page.waitForLoadState("networkidle"), del.locator("button").click()]);
  check(await until(async () => (await one(`select count(*)::int n from neon_auth."user" where id = $1`, [mId])).n === 0), "admin exclui conta a pedido do titular");
  await A.go("/pt/admin/auditoria?acao=account");
  check(await A.has("Conta excluída"), "auditoria registra as exclusões");
} catch (e) {
  check(false, "erro inesperado", e.message.split("\n")[0]);
} finally {
  await browser.close();
  const users = `(select id from neon_auth."user" where email like 'vp-e2e-%@example.com')`;
  await q(`delete from audit_log where actor_id in ${users}
           or entity_id in (select a.id from athletes a join athlete_guardians g on g.athlete_id = a.id where g.profile_id in ${users})
           or entity_id in (select organization_id from organization_members where profile_id in ${users})
           or entity_id in (select id from organizations where name like '%[E2E]%')
           or entity_id in ${users}`);
  await q(`delete from contact_requests where organization_id in (select id from organizations where name like '%[E2E]%') or requested_by in ${users}`);
  await q(`delete from athlete_views where viewer_id in ${users}`);
  await q(`delete from athletes where id in (select athlete_id from athlete_guardians where profile_id in ${users})`);
  await q(`delete from athlete_org_blocks where created_by in ${users}`);
  await q(`delete from organizations where id in (select organization_id from organization_members where profile_id in ${users}) or name like '%[E2E]%'`);
  const { rowCount } = await q(`delete from neon_auth."user" where email like 'vp-e2e-%@example.com'`);
  await q(`delete from athletes a where not exists (select 1 from athlete_guardians g where g.athlete_id = a.id)`);
  await q(`delete from neon_auth.verification where identifier like '%vp-e2e-%@example.com'`);
  await q(`delete from audit_log where action like 'account.%' and actor_id is null`);
  const left = (await q(`select (select count(*)::int from neon_auth."user") u, (select count(*)::int from athletes) a, (select count(*)::int from organizations) o,
                               (select count(*)::int from admin_mfa) m, (select enabled from ai_settings) ia`)).rows[0];
  console.log(`\nLimpeza: ${rowCount} contas de teste apagadas · restaram ${left.u} usuários, ${left.a} atletas, ${left.o} organizações, ${left.m} segundos fatores · IA ligada: ${left.ia}`);
  await client.end();
}
console.log(`Resultado: ${ok} ok, ${bad} falha(s)`);
process.exit(bad ? 1 : 0);
