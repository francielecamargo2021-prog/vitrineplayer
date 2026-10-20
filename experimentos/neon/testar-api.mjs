// Teste de ponta a ponta no banco de HOMOLOGAÇÃO, pelo mesmo caminho do navegador:
// Neon Auth (cadastro/login reais) → JWT → Data API (RLS no banco).
// Usuários fictícios @example.com, apagados no fim junto com tudo o que criaram.
import { createRemoteJWKSet, jwtVerify } from "jose";
import { connect, env } from "./db.mjs";

const E = env();
const AUTH = E.NEON_AUTH_URL;
const REST = E.NEON_DATA_API_URL;
const ORIGIN = "http://localhost:3000";
const run = Date.now().toString(36);
const mail = (k) => `vp-teste-${k}-${run}@example.com`;
const PASS = `Teste-${run}-Senha!9`;
let pass = 0, fail = 0;
const check = (ok, desc, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${desc}${extra ? ` — ${extra}` : ""}`); ok ? pass++ : fail++; };

async function authCall(path, body, cookie) {
  const r = await fetch(`${AUTH}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = r.headers.getSetCookie?.() ?? [];
  const cookieOut = set.map((c) => c.split(";")[0]).join("; ");
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json, cookie: cookieOut };
}
async function jwtFor(cookie) {
  const t = await authCall("/token", null, cookie);
  return t.json?.token ?? null;
}
async function rest(token, path, { method = "GET", body, prefer } = {}) {
  const r = await fetch(`${REST}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; const text = await r.text(); try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
}
const rpc = (token, fn, args) => rest(token, `/rpc/${fn}`, { method: "POST", body: args });

const created = { users: [], athletes: [], orgs: [] };
const { client: db } = await connect();
try {
  // ---------------------------------------------------------------- 1. cadastro e login (Neon Auth)
  console.log("— 1. Cadastro e login (Neon Auth real)");
  const signup = {};
  for (const k of ["a", "b", "p"]) {
    const r = await authCall("/sign-up/email", { email: mail(k), password: PASS, name: `[TESTE] Usuário ${k.toUpperCase()}` });
    signup[k] = r;
    if (r.json?.user?.id) created.users.push(r.json.user.id);
    check(r.status === 200 && !!r.json?.user?.id, `cadastro ${k.toUpperCase()} no Neon Auth`, `HTTP ${r.status}`);
  }
  const dup = await authCall("/sign-up/email", { email: mail("a"), password: PASS, name: "dup" });
  check(dup.status >= 400, "e-mail repetido é recusado", `HTTP ${dup.status}`);
  const bad = await authCall("/sign-in/email", { email: mail("a"), password: "senha-errada-123" });
  check(bad.status === 401 || bad.status === 400, "senha errada é recusada", `HTTP ${bad.status}`);
  const login = {};
  for (const k of ["a", "b", "p"]) {
    login[k] = await authCall("/sign-in/email", { email: mail(k), password: PASS });
    check(login[k].status === 200 && login[k].cookie.length > 0, `login ${k.toUpperCase()} devolve sessão (cookie)`, `HTTP ${login[k].status}`);
  }
  const sess = await authCall("/get-session", null, login.a.cookie);
  check(sess.json?.user?.email === mail("a"), "sessão identifica o usuário certo");

  const tok = {};
  for (const k of ["a", "b", "p"]) tok[k] = await jwtFor(login[k].cookie);
  check(Object.values(tok).every(Boolean), "cada sessão gera um JWT para a Data API");
  const JWKS = createRemoteJWKSet(new URL(`${AUTH}/.well-known/jwks.json`));
  const { payload } = await jwtVerify(tok.a, JWKS);
  check(payload.sub === signup.a.json.user.id, "JWT assinado pelo Neon Auth e verificável pelo servidor", `alg EdDSA, expira em ${Math.round((payload.exp - Date.now() / 1000) / 60)} min`);
  const ids = { a: signup.a.json.user.id, b: signup.b.json.user.id, p: signup.p.json.user.id };

  // ---------------------------------------------------------------- 2. perfil + complete_signup
  console.log("— 2. Perfil criado no cadastro e dados complementares");
  let r = await rest(tok.a, "/profiles?select=id,role,full_name,email");
  check(r.status === 200 && r.json.length === 1 && r.json[0].id === ids.a && r.json[0].role === "RESPONSIBLE",
    "gatilho criou o perfil e A só lê o próprio", `HTTP ${r.status}, ${Array.isArray(r.json) ? r.json.length : "?"} linha(s)`);
  r = await rpc(tok.a, "complete_signup", { p_whatsapp: "+5511999990001", p_country: "br", p_locale: "pt-BR", p_consents: ["terms", "privacy", "guardian_declaration", "no_guarantee", "marketing_whatsapp"], p_consent_version: "2026-10" });
  check(r.status === 204 || r.status === 200, "complete_signup grava WhatsApp, país e consentimentos", `HTTP ${r.status}`);
  r = await rest(tok.a, "/consents?select=kind");
  check(r.json?.length === 4, "só os 4 consentimentos conhecidos foram gravados", `${r.json?.length}`);
  r = await rpc(tok.a, "complete_signup", { p_whatsapp: "+5500000000000", p_country: "AR", p_locale: "es", p_consents: ["terms"], p_consent_version: "x" });
  check(r.status >= 400, "complete_signup não pode ser repetido", `HTTP ${r.status}`);
  r = await rest(tok.b, "/profiles?select=id");
  check(r.json?.length === 1 && r.json[0].id === ids.b, "B só lê o próprio perfil");

  // ---------------------------------------------------------------- 3. regras de acesso pela Data API
  console.log("— 3. Regras de acesso pela Data API (RLS no banco)");
  r = await rpc(tok.a, "create_athlete", { p_full_name: "[TESTE] Atleta Fictício", p_sport_name: "Fictício", p_birth_date: "2011-04-02", p_country: "BR" });
  const athA = r.json; if (typeof athA === "string") created.athletes.push(athA);
  check(r.status === 200 && typeof athA === "string", "A cria atleta pela função create_athlete", `HTTP ${r.status}`);
  r = await rest(tok.a, "/athletes", { method: "POST", body: { full_name: "x", birth_date: "2011-01-01", country: "BR" } });
  check(r.status >= 400, "insert direto em athletes é bloqueado", `HTTP ${r.status}`);
  r = await rest(tok.a, "/athletes?select=id"); check(r.json?.length === 1, "A vê 1 atleta (o seu)");
  r = await rest(tok.b, "/athletes?select=id"); check(Array.isArray(r.json) && r.json.length === 0, "B não vê o atleta de A");
  r = await rest(tok.b, `/athletes?id=eq.${athA}`, { method: "PATCH", body: { sport_name: "invadido" }, prefer: "return=representation" });
  check(Array.isArray(r.json) && r.json.length === 0, "B não altera o atleta de A");
  r = await rest(tok.a, `/athletes?id=eq.${athA}&select=sport_name`); check(r.json?.[0]?.sport_name === "Fictício", "atleta de A continua intacto");
  r = await rest(tok.a, `/athletes?id=eq.${athA}`, { method: "PATCH", body: { status: "approved" }, prefer: "return=representation" });
  check(r.status >= 400, "responsável não se autoaprova", `HTTP ${r.status}`);
  r = await rpc(tok.a, "mark_payment_paid", { p_payment: athA, p_provider: "x", p_provider_ref: "x" });
  check(r.status === 401 || r.status === 403 || /permission denied/i.test(JSON.stringify(r.json)), "usuário não confirma pagamento", `HTTP ${r.status}`);
  r = await rpc(tok.a, "admin_review_athlete", { p_athlete: athA, p_decision: "approve" });
  check(r.status >= 400 && /not allowed/.test(JSON.stringify(r.json)), "usuário comum não executa revisão do admin", `HTTP ${r.status}`);
  r = await rest(null, "/athletes?select=id");
  check(r.status === 401 || (r.status === 400 && /missing authentication/i.test(JSON.stringify(r.json))) || (Array.isArray(r.json) && r.json.length === 0),
    "sem login não lê atletas (Data API exige token)", `HTTP ${r.status}`);
  r = await rest(tok.a, "/ai_settings?select=*"); check(Array.isArray(r.json) && r.json.length === 0, "configurações da IA invisíveis para usuário comum");
  r = await rest(tok.a, "/audit_log?select=id"); check(Array.isArray(r.json) && r.json.length === 0, "auditoria invisível para usuário comum");

  // profissional: organização aprovada + atleta aprovado (o admin faria pelo painel; aqui, pelo dono do banco)
  const { rows: [org] } = await db.query({ text: `insert into organizations (name, kind, country, status) values ($1, 'club', 'BR', 'approved') returning id`, values: [`[TESTE] Clube ${run}`] });
  created.orgs.push(org.id);
  await db.query({ text: `update profiles set role = 'PROFESSIONAL' where id = $1`, values: [ids.p] });
  await db.query({ text: `insert into organization_members (organization_id, profile_id) values ($1, $2)`, values: [org.id, ids.p] });
  r = await rest(tok.p, "/athletes?select=id"); check(Array.isArray(r.json) && r.json.length === 0, "profissional não vê atleta ainda não aprovado");
  // aprovação como o painel admin faria (papel privilegiado; a trava do banco recusa conexão comum)
  await db.query("begin");
  await db.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)");
  await db.query({ text: `update athletes set status = 'approved', approved_at = now() where id = $1`, values: [athA] });
  await db.query("commit");
  // 0008: o profissional não lê a tabela; recebe só o cartão pela função do portal (sem nome completo)
  r = await rest(tok.p, "/athletes?select=id,full_name"); check(Array.isArray(r.json) && r.json.length === 0, "profissional não lê a tabela de atletas (0008)");
  r = await rpc(tok.p, "pro_search_athletes", {});
  check(r.json?.length === 1 && r.json[0].id === athA && !("full_name" in r.json[0]) && !("birth_date" in r.json[0]),
    "profissional aprovado vê o atleta aprovado só pelo cartão do portal", `HTTP ${r.status}`);
  r = await rest(tok.p, "/profiles?select=id,email,whatsapp"); check(r.json?.length === 1 && r.json[0].id === ids.p, "profissional nunca lê contato do responsável");
  r = await rest(tok.a, "/athlete_org_blocks", { method: "POST", body: { athlete_id: athA, organization_id: org.id }, prefer: "return=minimal" });
  check(r.status === 201, "responsável bloqueia a organização", `HTTP ${r.status}`);
  r = await rpc(tok.p, "pro_search_athletes", {}); check(Array.isArray(r.json) && r.json.length === 0, "organização bloqueada deixa de ver o atleta");

  // ---------------------------------------------------------------- 4. autorização das fotos (caminho do servidor)
  console.log("— 4. Autorização das fotos (servidor verifica o JWT e consulta o banco como o usuário)");
  async function asUser(token, sql, values) {
    const { payload } = await jwtVerify(token, JWKS);
    await db.query("begin");
    try {
      await db.query({ text: "select set_config('request.jwt.claims', $1, true)", values: [JSON.stringify({ sub: payload.sub, role: "authenticated" })] });
      await db.query("set local role authenticated");
      const res = await db.query({ text: sql, values });
      await db.query("commit");
      return res;
    } catch (e) { await db.query("rollback"); throw e; }
  }
  const path = `${athA}/foto-${run}.webp`;
  await asUser(tok.a, "insert into storage.objects (bucket_id, name, blob_url) values ('athlete-photos', $1, 'privado://teste')", [path]);
  check(true, "A registra a foto na pasta do próprio atleta");
  let denied = false;
  try { await asUser(tok.b, "insert into storage.objects (bucket_id, name) values ('athlete-photos', $1)", [`${athA}/intruso.webp`]); } catch { denied = true; }
  check(denied, "B não registra foto na pasta do atleta de A");
  const can = async (t) => (await asUser(t, "select 1 from storage.objects where bucket_id = 'athlete-photos' and name = $1", [path])).rows.length === 1;
  check(await can(tok.a), "A pode abrir a foto");
  check(!(await can(tok.b)), "B não pode abrir a foto");
  check(!(await can(tok.p)), "profissional de organização bloqueada não abre a foto");
  await asUser(tok.a, "delete from athlete_org_blocks where athlete_id = $1", [athA]);
  check(await can(tok.p), "sem o bloqueio, o profissional aprovado abre a foto");
} catch (e) {
  check(false, "erro inesperado no teste", e.message);
} finally {
  // ---------------------------------------------------------------- limpeza (só o que este teste criou)
  await db.query("rollback").catch(() => {});
  if (created.athletes.length) await db.query({ text: "delete from storage.objects where storage.foldername(name) && $1::text[]", values: [created.athletes] }).catch(() => {});
  if (created.athletes.length) await db.query({ text: "delete from athletes where id = any($1)", values: [created.athletes] });
  if (created.orgs.length) await db.query({ text: "delete from organizations where id = any($1)", values: [created.orgs] });
  if (created.users.length) await db.query({ text: "delete from audit_log where actor_id = any($1)", values: [created.users] });
  if (created.users.length) await db.query({ text: `delete from neon_auth."user" where id = any($1)`, values: [created.users] });
  const { rows: [left] } = await db.query(`select (select count(*)::int from neon_auth."user") users, (select count(*)::int from profiles) profiles, (select count(*)::int from athletes) athletes, (select count(*)::int from organizations) orgs`);
  console.log(`\nLimpeza: restaram ${left.users} usuários, ${left.profiles} perfis, ${left.athletes} atletas, ${left.orgs} organizações`);
  await db.end();
  console.log(`Resultado: ${pass} ok, ${fail} falha(s)`);
  process.exitCode = fail ? 1 : 0;
}
