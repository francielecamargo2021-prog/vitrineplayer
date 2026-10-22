// Teste de ponta a ponta do LOGIN (Etapa 2) num navegador real, contra o app rodando
// localmente e ligado à HOMOLOGAÇÃO (Neon Auth + banco).
//
//   VP_ENV=homolog VP_DB_URL_FILE=… APP_URL=http://localhost:3300 node db/tests/testar-login.mjs
//
// Só contas fictícias vp-e2e-…@example.com, apagadas no fim (com tudo o que criaram).
// Códigos de e-mail: o Neon Auth guarda só o hash do código. Para não depender de uma
// caixa de e-mail, o teste grava no banco o hash de um código conhecido (123456) para a
// conta fictícia, e quem confere o código continua sendo o Neon Auth.
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";
import { conectar } from "../conexao.mjs";
import { adminSecondFactor } from "./lib/segundo-fator.mjs";
import { deriveKey } from "../../src/lib/auth/limits.ts";

const APP = process.env.APP_URL ?? "http://localhost:3300";
const AUTH = process.env.NEON_AUTH_BASE_URL;
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const run = Date.now().toString(36);
const mail = (k) => `vp-e2e-${k}-${run}@example.com`;
const PASS = `Teste-${run}-Senha!9`;
const PASS2 = `Nova-${run}-Senha!7`;
const CODE = "123456";
const CODE_HASH = createHash("sha256").update(CODE).digest("base64url");

let ok = 0, bad = 0;
const check = (c, d, x = "") => { console.log(`${c ? "✓" : "✗"} ${d}${x ? ` — ${x}` : ""}`); c ? ok++ : bad++; };
const section = (t) => console.log(`\n— ${t}`);

const { client, branch } = await conectar();
if (branch !== "br-steep-glitter-b6dfr3z6" && process.env.VP_ENV === "homolog") console.log(`(branch ${branch})`);
const q = (t, v) => client.query(v ? { text: t, values: v } : t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera o Neon Auth registrar o pedido de código e troca pelo hash do código conhecido. */
async function knownCode(email, type) {
  const id = `${type}-otp-${email}`;
  for (let i = 0; i < 20; i++) {
    const { rowCount } = await q(`update neon_auth.verification set value = $1 where identifier = $2`, [`${CODE_HASH}:0`, id]);
    if (rowCount) return true;
    await sleep(500);
  }
  return false;
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ locale: "pt-BR" });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
const path = () => new URL(page.url()).pathname;
const text = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");
const has = async (...words) => { const t = (await text()).toUpperCase(); return words.every((w) => t.includes(w.toUpperCase())); };
const go = async (p) => { const r = await page.goto(APP + p); return r?.status() ?? 0; };
const submit = async () => { await Promise.all([page.waitForLoadState("networkidle"), page.locator("form button").first().click()]); await page.waitForTimeout(400); };

async function signup(email, name) {
  await go("/pt/cadastro");
  await page.fill('input[name="full_name"]', name);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASS);
  await page.fill('input[name="confirm"]', PASS);
  await page.fill('input[name="whatsapp"]', "+55 11 99999-0001");
  await page.selectOption('select[name="country"]', "BR");
  for (const c of ["terms", "privacy", "guardian_declaration", "no_guarantee"]) await page.check(`input[name="${c}"]`);
  await submit();
  await page.waitForURL(/\/entrar\/verificar|\/cadastro/, { timeout: 30000 }).catch(() => {});
}
async function login(email, password) {
  await sleep(4000);
  await go("/pt/entrar");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await submit();
}
async function logout() {
  const btn = page.locator("header form button");
  if (await btn.count()) { await Promise.all([page.waitForURL(/\/entrar/), btn.first().click()]); }
}

const A = mail("a"), B = mail("b"), C = mail("c");
try {
  // ------------------------------------------------------------------ landing intacta
  section("Landing page (não pode mudar)");
  for (const [p, must] of [["/pt", ["QUALQUER", "LUGAR.", "A GENTE COLOCA ELE NA", "CADASTRAR ATLETA"]], ["/es", ["REGISTRAR ATLETA"]]]) {
    const s = await go(p);
    const t = (await text()).toUpperCase();
    check(s === 200 && must.every((m) => t.includes(m)), `${p} abre com hero, slogan e botão`, `HTTP ${s}`);
  }
  await go("/pt");
  await page.waitForFunction(() => [...document.querySelectorAll("video")].some((v) => v.currentSrc || v.getAttribute("src")), null, { timeout: 15000 }).catch(() => {});
  const video = await page.evaluate(() => [...document.querySelectorAll("video")].map((v) => v.currentSrc || v.getAttribute("src") || ""));
  check(video.some((v) => v?.includes("hero")), "vídeo do hero presente", video.join(", "));

  // ------------------------------------------------------------------ proteção sem login
  section("Proteção das áreas privadas (sem login)");
  for (const [p, dest] of [["/pt/painel", "/pt/entrar"], ["/es/painel", "/es/entrar"], ["/pt/painel/atleta/novo", "/pt/entrar"], ["/pt/admin", "/pt/entrar"], ["/es/admin/atletas", "/es/entrar"]]) {
    await go(p);
    check(path() === dest, `${p} sem login → ${dest}`, path());
  }

  // ------------------------------------------------------------------ cadastro em 2 passos
  section("Cadastro em 2 passos");
  await go("/pt/cadastro");
  await page.fill('input[name="full_name"]', "Resp Teste");
  await page.fill('input[name="email"]', A);
  await page.fill('input[name="password"]', PASS);
  await page.fill('input[name="confirm"]', PASS + "x");
  await page.fill('input[name="whatsapp"]', "+5511999990001");
  await page.selectOption('select[name="country"]', "BR");
  for (const c of ["terms", "privacy", "guardian_declaration", "no_guarantee"]) await page.check(`input[name="${c}"]`);
  await submit();
  check((await text()).includes("As senhas não conferem"), "senhas diferentes são recusadas");
  const none = (await q(`select count(*)::int n from neon_auth."user" where email = $1`, [A])).rows[0].n;
  check(none === 0, "nada é criado quando o formulário é recusado");

  await signup(A, "Resp Teste A");
  check(path() === "/pt/entrar/verificar", "cadastro leva à confirmação do e-mail", path());
  const pa = (await q(`select p.role::text role, p.whatsapp, p.country, p.locale, u."emailVerified" v,
      (select count(*)::int from consents c where c.profile_id = p.id and c.athlete_id is null) consents
      from profiles p join neon_auth."user" u on u.id = p.id where u.email = $1`, [A])).rows[0];
  check(pa?.role === "RESPONSIBLE", "conta nova é sempre RESPONSIBLE", pa?.role);
  check(pa?.whatsapp === "+5511999990001" && pa?.country === "BR" && pa?.locale === "pt-BR", "passo 2 gravou WhatsApp, país e idioma");
  check(pa?.consents === 4, "os 4 consentimentos foram registrados", String(pa?.consents));
  check(pa?.v === false, "e-mail ainda não confirmado");

  await go("/pt/painel");
  check(path() === "/pt/entrar/verificar", "sem confirmar o e-mail, o painel não abre", path());

  await page.fill('input[name="code"]', "000000");
  await submit();
  check((await text()).includes("Código inválido"), "código errado é recusado");

  // espera progressiva por e-mail e tipo (0014): o código do cadastro acabou de sair
  await page.locator("form").nth(1).locator("button").click();
  const waitMsg = await page.waitForSelector("text=Aguarde um pouco", { timeout: 15000 }).then(() => true, () => false);
  check(waitMsg, "reenviar logo em seguida pede para aguardar (o último código continua valendo)");
  await sleep(31000);
  await page.locator("form").nth(1).locator("button").click();
  const resent = await page.waitForSelector("text=novo código foi enviado", { timeout: 15000 }).then(() => true, () => false);
  check(resent, "depois de 30 s, reenviar código funciona");

  check(await knownCode(A, "email-verification"), "Neon Auth registrou o pedido de código");
  await page.fill('input[name="code"]', CODE);
  await submit();
  await page.waitForURL(/\/pt\/painel/).catch(() => {});
  check(path() === "/pt/painel" && (await has("Comece pelo")), "código certo confirma o e-mail e abre o painel", path());
  check((await text()).includes("Resp Teste A"), "painel mostra o nome do responsável");
  const verified = (await q(`select "emailVerified" v from neon_auth."user" where email = $1`, [A])).rows[0].v;
  check(verified === true, "e-mail marcado como confirmado no Neon Auth");

  const cookies = await ctx.cookies();
  const sess = cookies.filter((c) => /session/i.test(c.name));
  check(sess.length > 0 && sess.every((c) => c.httpOnly && c.sameSite !== "None"), "cookie de sessão é HttpOnly e SameSite", sess.map((c) => `${c.name}:${c.sameSite}`).join(", "));

  await go("/pt/admin");
  check((await page.locator("text=404").count()) > 0 || (await text()).includes("could not be found") || (await text()).toLowerCase().includes("não encontrada"), "responsável em /admin recebe 404 (área não se anuncia)");
  await go("/pt/entrar");
  check(path() === "/pt/painel", "logado, Entrar leva ao painel");

  await go("/pt/cadastro");
  await logout();
  check(path() === "/pt/entrar", "sair encerra a sessão");
  await go("/pt/painel");
  check(path() === "/pt/entrar", "depois de sair, o painel exige login de novo");

  // E3: senha comum é recusada no servidor (a tela só confere o tamanho)
  await go("/pt/cadastro");
  await page.fill('input[name="full_name"]', "Senha Fraca");
  await page.fill('input[name="email"]', mail("fraca"));
  await page.fill('input[name="password"]', "flamengo2024");
  await page.fill('input[name="confirm"]', "flamengo2024");
  await page.fill('input[name="whatsapp"]', "+5511999990009");
  await page.selectOption('select[name="country"]', "BR");
  for (const c of ["terms", "privacy", "guardian_declaration", "no_guarantee"]) await page.check(`input[name="${c}"]`);
  await submit();
  check((await text()).includes("muito comum"), "senha comum (flamengo2024) é recusada com mensagem clara");

  // E3: e-mail repetido recebe a MESMA resposta de um cadastro novo (não revela a conta)
  const tDup = Date.now();
  await signup(A, "Duplicado");
  const dupMs = Date.now() - tDup;
  check(path() === "/pt/entrar/verificar" && (await has("Já tem conta com este e-mail")), "e-mail repetido vai para a mesma tela de código, com a dica de entrar ou recuperar a senha", path());
  check(!(await text()).includes("Já existe uma conta"), "a tela não diz que o e-mail já tem conta");
  check(dupMs >= 1800, "a resposta respeita o mesmo tempo mínimo do cadastro novo", `${dupMs} ms`);
  const [{ n: dupUsers, nome }] = (await q(`select count(*)::int n, max(name) nome from neon_auth."user" where lower(email) = lower($1)`, [A])).rows;
  check(dupUsers === 1 && nome !== "Duplicado", "nenhuma conta nova e a conta existente não é alterada");

  // ------------------------------------------------------------------ entrar
  section("Entrar");
  await login(A, "senha-errada-123");
  check((await text()).includes("E-mail ou senha incorretos"), "senha errada é recusada");
  await login(A, PASS);
  await page.waitForURL(/\/pt\/painel/).catch(() => {});
  check(path() === "/pt/painel", "login correto abre o painel", path());
  await logout();

  section("Limite contra força bruta (app, migration 0013)");
  // O Neon Auth gerenciado não limita senhas erradas; o app limita (e-mail + IP: 5 erros → espera).
  const tries = [];
  for (let i = 0; i < 7; i++) {
    await sleep(4000); // espaçadas, como uma pessoa (o Neon Auth tem limite próprio para rajadas)
    await go("/pt/entrar");
    await page.fill('input[name="email"]', mail("forca-bruta"));
    await page.fill('input[name="password"]', `errada-${i}-xxxx`);
    await page.locator("form button").first().click();
    const msg = await page.waitForSelector("text=/Muitas tentativas|E-mail ou senha incorretos/", { timeout: 20000 }).then((e) => e.innerText(), () => "");
    tries.push(msg.includes("Muitas tentativas"));
  }
  check(tries.slice(0, 5).every((x) => !x), "as 5 primeiras senhas erradas são conferidas normalmente", tries.join(","));
  check(tries[5] && tries[6], "a partir da 6ª, \"muitas tentativas\" (sem consultar a senha)", tries.join(","));
  // conta inexistente e conta real recebem a mesma resposta: o limite não revela se a conta existe
  const [{ n: keysNoBanco }] = (await q(`select count(*)::int n from auth_attempts where key ~ '^[0-9a-f]{64}$'`)).rows;
  check(keysNoBanco > 0, "contadores gravados só como código (HMAC), sem e-mail em texto");
  const [{ n: emTexto }] = (await q(`select count(*)::int n from auth_attempts where key like '%@%'`)).rows;
  check(emTexto === 0, "nenhum e-mail em texto na tabela de tentativas");
  // A (conta real, mesmo IP) continua entrando: o bloqueio é por e-mail + IP
  await login(A, PASS);
  await page.waitForURL(/\/pt\/painel/).catch(() => {});
  check(path() === "/pt/painel", "outra conta no mesmo IP continua entrando", path());
  await logout();

  // ------------------------------------------------------------------ proteção por conta (E2, migration 0014)
  section("Proteção por conta: desafio por código, sem bloqueio (0014)");
  // Cada tentativa vem de outra rede (cabeçalho X-Forwarded-For, aceito só no app local)
  // e de outro "aparelho" (contexto novo, sem cookies): a proteção é por conta.
  const fromNetwork = async (ip) => {
    const c = await browser.newContext({ locale: "pt-BR", extraHTTPHeaders: { "x-forwarded-for": ip } });
    const p = await c.newPage();
    p.setDefaultTimeout(30000);
    return { c, p };
  };
  const tryPassword = async (p, pw) => {
    await p.goto(`${APP}/pt/entrar`);
    await p.fill('input[name="email"]', A);
    await p.fill('input[name="password"]', pw);
    await p.locator("form button").first().click();
    return p.waitForSelector("text=/incorretos|Confirme que é você|Muitas tentativas|falha temporária/", { timeout: 30000 }).then((e) => e.innerText(), () => "");
  };
  const wrong = [];
  for (let i = 0; i < 5; i++) {
    await sleep(4000);
    const { c, p } = await fromNetwork(`198.51.100.${i + 1}`);
    wrong.push((await tryPassword(p, `errada-${i}-xxxx`)).includes("incorretos"));
    await c.close();
  }
  check(wrong.every(Boolean), "5 senhas erradas, de 5 redes e aparelhos diferentes, são conferidas e recusadas", wrong.join(","));
  await sleep(4000);
  const victim = await fromNetwork("198.51.100.50");
  const msg = await tryPassword(victim.p, PASS);
  check(msg.includes("Confirme que é você") && (await victim.p.locator('[data-testid="login-codigo"]').count()) === 1,
    "6ª tentativa, mesmo com a senha CERTA e de outra rede: pede o código (a senha nem é conferida)", msg.slice(0, 60));
  check(await knownCode(A, "sign-in"), "um código de entrada foi enviado ao e-mail da conta");
  await victim.p.fill('input[name="code"]', "000000");
  await victim.p.locator('button[value="code"]').click();
  check(await victim.p.waitForSelector("text=Código inválido", { timeout: 15000 }).then(() => true, () => false), "código errado é recusado");
  await knownCode(A, "sign-in");
  await victim.p.fill('input[name="code"]', CODE);
  await victim.p.locator('button[value="code"]').click();
  await victim.p.waitForURL(/\/pt\/painel/, { timeout: 30000 }).catch(() => {});
  check(new URL(victim.p.url()).pathname === "/pt/painel", "com o código certo, a família entra", new URL(victim.p.url()).pathname);
  const dev = (await victim.c.cookies()).find((k) => k.name === "vp_dev");
  check(Boolean(dev?.httpOnly) && /^[A-Za-z0-9_-]{43}$/.test(dev?.value ?? ""), "o aparelho recebe um token aleatório em cookie HttpOnly");
  const [{ n: devRows }] = (await q(`select count(*)::int n from auth_devices where token_hash ~ '^[0-9a-f]{64}$'`)).rows;
  const [{ n: plain }] = (await q(`select count(*)::int n from auth_devices where token_hash = $1`, [dev?.value ?? ""])).rows;
  check(devRows > 0 && plain === 0, "o banco guarda só o hash do token (nunca o token)");
  const [{ n: guardLeft }] = (await q(`select count(*)::int n from auth_account_guard where account_key = $1`,
    [deriveKey(process.env.NEON_AUTH_COOKIE_SECRET ?? "", "account", A)])).rows;
  check(guardLeft === 0, "o login completo zera a proteção da conta");
  await victim.c.close();

  section("E-mail sem conta: mesma resposta, nenhum código e nenhuma conta criada (opção B)");
  const NONE = mail("sem-conta");
  const noneAnswers = [];
  for (let i = 0; i < 5; i++) {
    await sleep(4000);
    const { c, p } = await fromNetwork(`198.51.100.${100 + i}`);
    await p.goto(`${APP}/pt/entrar`);
    await p.fill('input[name="email"]', NONE);
    await p.fill('input[name="password"]', `qualquer-${i}-xxxx`);
    await p.locator("form button").first().click();
    noneAnswers.push(await p.waitForSelector("text=/incorretos|Confirme que é você|Muitas tentativas/", { timeout: 30000 }).then((e) => e.innerText(), () => ""));
    await c.close();
  }
  check(noneAnswers.every((m) => m.includes("incorretos")), "e-mail sem conta: as 5 primeiras respostas são iguais às de uma conta real");
  await sleep(4000);
  const semConta = await fromNetwork("198.51.100.150");
  await semConta.p.goto(`${APP}/pt/entrar`);
  await semConta.p.fill('input[name="email"]', NONE);
  await semConta.p.fill('input[name="password"]', "qualquer-6-xxxx");
  const t0 = Date.now();
  await semConta.p.locator("form button").first().click();
  const noneMsg = await semConta.p.waitForSelector("text=/incorretos|Confirme que é você|Muitas tentativas/", { timeout: 30000 }).then((e) => e.innerText(), () => "");
  const noneMs = Date.now() - t0;
  check(noneMsg.includes("Confirme que é você"), "e-mail sem conta: a 6ª também pede código (não revela que a conta não existe)");
  check(noneMs >= 900, "a resposta sem conta respeita o tempo mínimo (igual à de uma conta real)", `${noneMs} ms`);
  const [{ n: noneCodes }] = (await q(`select count(*)::int n from neon_auth.verification where identifier = $1`, [`sign-in-otp-${NONE}`])).rows;
  check(noneCodes === 0, "e-mail sem conta: nenhum código de entrada é pedido ao Neon Auth");
  // Simula um código obtido por fora do app (chamada direta ao Neon Auth): mesmo válido, o app não o usa.
  await q(`insert into neon_auth.verification (identifier, value, "expiresAt") values ($1, $2, now() + interval '5 minutes')`, [`sign-in-otp-${NONE}`, `${CODE_HASH}:0`]);
  await semConta.p.fill('input[name="code"]', CODE);
  await semConta.p.locator('button[value="code"]').click();
  const codeMsg = await semConta.p.waitForSelector("text=/Código inválido|Muitas tentativas|indispon/", { timeout: 30000 }).then((e) => e.innerText(), () => "");
  check(codeMsg.includes("Código inválido"), "código digitado para e-mail sem conta: resposta genérica de código inválido", codeMsg);
  await sleep(1500);
  const created = (await q(`select count(*)::int n from neon_auth."user" where lower(email) = lower($1)`, [NONE])).rows[0].n;
  check(created === 0, "nenhuma conta é criada pelo login por código (nem com um código válido obtido por fora)");
  const [{ n: unused }] = (await q(`select count(*)::int n from neon_auth.verification where identifier = $1`, [`sign-in-otp-${NONE}`])).rows;
  check(unused === 1, "o app nem chega a apresentar o código ao Neon Auth (continua sem uso)");
  check(new URL(semConta.p.url()).pathname === "/pt/entrar", "continua na tela de entrada");
  await q(`delete from neon_auth.verification where identifier = $1`, [`sign-in-otp-${NONE}`]);
  await semConta.c.close();

  // ------------------------------------------------------------------ recuperação de senha
  section("Recuperação de senha por código");
  await go("/pt/entrar");
  await page.click("text=Esqueci minha senha");
  await page.waitForURL(/recuperar/);
  await page.fill('input[name="email"]', A);
  await submit();
  check(path() === "/pt/entrar/recuperar" && (await page.locator('input[name="code"]').count()) === 1, "pedido de código leva ao formulário de nova senha");
  check(await knownCode(A, "forget-password"), "Neon Auth registrou o pedido de recuperação");
  await page.fill('input[name="code"]', "111111");
  await page.fill('input[name="password"]', PASS2);
  await page.fill('input[name="confirm"]', PASS2);
  await submit();
  // a ação confere o limite de tentativas no banco antes do Neon Auth: espera a resposta
  check(await page.waitForSelector("text=Código inválido", { timeout: 15000 }).then(() => true, () => false), "código de recuperação errado é recusado");
  await knownCode(A, "forget-password");
  await page.fill('input[name="code"]', CODE);
  await page.fill('input[name="password"]', PASS2);
  await page.fill('input[name="confirm"]', PASS2);
  await submit();
  check(await page.waitForSelector("text=Senha alterada", { timeout: 15000 }).then(() => true, () => false), "código certo troca a senha");
  // chave da conta = HMAC com o mesmo segredo do app (NEON_AUTH_COOKIE_SECRET do ambiente de teste)
  const accKey = deriveKey(process.env.NEON_AUTH_COOKIE_SECRET ?? "", "account", A);
  const [{ n: devAfterReset }] = (await q(`select count(*)::int n from auth_devices where account_key = $1`, [accKey])).rows;
  check(devAfterReset === 0, "trocar a senha revoga todos os aparelhos reconhecidos da conta");
  await login(A, PASS);
  check((await text()).includes("E-mail ou senha incorretos"), "senha antiga deixa de funcionar");
  await login(A, PASS2);
  await page.waitForURL(/\/pt\/painel/).catch(() => {});
  check(path() === "/pt/painel", "nova senha funciona", path());
  await logout();

  await go("/pt/entrar/recuperar");
  await page.fill('input[name="email"]', mail("nao-existe"));
  await submit();
  check(path() === "/pt/entrar/recuperar" && (await page.locator('input[name="code"]').count()) === 1, "e-mail inexistente recebe a mesma resposta (não revela contas)");

  // ------------------------------------------------------------------ conta incompleta
  section("Conta criada fora do formulário (cadastro incompleto)");
  const r = await fetch(`${AUTH}/sign-up/email`, { method: "POST", headers: { "Content-Type": "application/json", Origin: APP }, body: JSON.stringify({ email: C, password: PASS, name: "Conta Direta C" }) });
  check(r.ok, "conta criada direto no Neon Auth (sem WhatsApp nem consentimentos)", `HTTP ${r.status}`);
  await login(C, PASS);
  await page.waitForURL(/verificar/).catch(() => {});
  check(path() === "/pt/entrar/verificar", "login de conta não confirmada pede o código", path());
  await knownCode(C, "email-verification");
  await page.fill('input[name="code"]', CODE);
  await submit();
  await page.waitForURL(/concluir/).catch(() => {});
  check(path() === "/pt/cadastro/concluir", "sem consentimentos, o painel manda concluir o cadastro", path());
  await go("/pt/painel/atleta/novo");
  check(path() === "/pt/cadastro/concluir", "nenhuma página do painel abre antes de concluir", path());
  await page.fill('input[name="whatsapp"]', "+5491155550000");
  await page.selectOption('select[name="country"]', "AR");
  for (const c of ["terms", "privacy", "guardian_declaration", "no_guarantee"]) await page.check(`input[name="${c}"]`);
  await submit();
  await page.waitForURL(/\/pt\/painel/).catch(() => {});
  const pc = (await q(`select p.country, (select count(*)::int from consents c where c.profile_id = p.id) n
      from profiles p join neon_auth."user" u on u.id = p.id where u.email = $1`, [C])).rows[0];
  check(path() === "/pt/painel" && pc?.country === "AR" && pc?.n === 4, "concluir cadastro grava país e consentimentos e libera o painel", `${path()} ${pc?.country} ${pc?.n}`);
  await logout();

  // ------------------------------------------------------------------ admin
  section("Administrador");
  await signup(B, "Admin Teste B");
  await knownCode(B, "email-verification");
  await page.fill('input[name="code"]', CODE);
  await submit();
  await page.waitForURL(/\/pt\/painel/).catch(() => {});
  await q(`update profiles set role = 'ADMIN' where id = (select id from neon_auth."user" where email = $1)`, [B]);
  await go("/pt/painel");
  check(path() === "/pt/entrar/segundo-fator", "admin sem segundo fator é levado à configuração do segundo fator", path());
  await adminSecondFactor(page, APP);
  check(path() === "/pt/admin" && (await has("Atletas aguardando revisão")), "com o segundo fator, o admin acessa a área", path());
  await go("/es/admin");
  check(path() === "/es/admin", "admin acessa /es/admin");
  await logout();

  // ------------------------------------------------------------------ espanhol
  section("Versão em espanhol");
  await go("/es/entrar");
  check(await has("Ingresar", "Olvidé mi contraseña", "Contraseña"), "/es/entrar em espanhol");
  await go("/es/cadastro");
  check(await has("Crear cuenta", "Nombre completo del responsable", "Declaro ser responsable legal"), "/es/cadastro em espanhol");
  await go("/es/entrar/recuperar");
  check(await has("Recuperar", "contraseña", "Enviar código"), "/es/entrar/recuperar em espanhol");
  await go("/es/entrar/verificar?email=x%40example.com");
  check(await has("Confirmá", "Código de 6 dígitos"), "/es/entrar/verificar em espanhol");
} catch (e) {
  check(false, "erro inesperado", e.message.split("\n")[0]);
} finally {
  await browser.close();
  const { rowCount } = await q(`delete from neon_auth."user" where email like 'vp-e2e-%@example.com'`);
  await q(`delete from neon_auth.verification where identifier like '%vp-e2e-%@example.com'`);
  const left = (await q(`select (select count(*)::int from neon_auth."user") u, (select count(*)::int from profiles) p, (select count(*)::int from consents) c`)).rows[0];
  console.log(`\nLimpeza: ${rowCount} contas de teste apagadas · restaram ${left.u} usuários, ${left.p} perfis, ${left.c} consentimentos`);
  await client.end();
}
console.log(`Resultado: ${ok} ok, ${bad} falha(s)`);
process.exit(bad ? 1 : 0);
