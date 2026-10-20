// Migrações do banco VitrinePlayer (Neon), com travas.
//
//   node db/migrar.mjs verificar                      só mostra o estado (não altera nada)
//   node db/migrar.mjs aplicar --branch=<id>          aplica as migrations pendentes
//   node db/migrar.mjs aplicar --branch=<id> --marcar  idem, num banco vazio (grava a marca do ambiente)
//   node db/migrar.mjs recriar --branch=<id> --confirmar-recriar=<id>
//        apaga as tabelas da aplicação e reaplica tudo do zero. Só com o banco SEM DADOS.
//
// Variáveis: VP_ENV (homolog | local) e VP_DB_URL_FILE (arquivo com o endereço).
//
// Travas:
//  * banco certo (ver conexao.mjs) e branch conferido: --branch tem de ser o branch real;
//  * marca do ambiente (vp_meta.environment) igual a VP_ENV;
//  * arquivos NNNN_nome.sql em sequência, sem buraco nem número repetido;
//  * cada arquivo aplicado fica registrado com sua impressão digital (SHA-256):
//    nada é reaplicado e um arquivo alterado depois de aplicado é recusado;
//  * tudo numa única transação, com trava contra execução simultânea:
//    se algo falhar, o banco fica exatamente como estava.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { conectar } from "./conexao.mjs";

class Recusa extends Error {}
const recusar = (msg) => { throw new Recusa(msg); };

export function lerMigrations(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const lista = files.map((f, i) => {
    const m = f.match(/^(\d{4})_[a-z0-9_]+\.sql$/);
    if (!m) recusar(`nome fora do padrão NNNN_nome.sql: ${f}`);
    if (Number(m[1]) !== i) recusar(`sequência quebrada: esperado ${String(i).padStart(4, "0")}_*, encontrado ${f}`);
    const sql = readFileSync(join(dir, f), "utf8");
    return { arquivo: f, sql, sha256: createHash("sha256").update(sql).digest("hex") };
  });
  if (!lista.length) recusar("nenhuma migration encontrada");
  return lista;
}

async function estado(q) {
  const { rows: [s] } = await q(`select
    exists (select 1 from pg_namespace where nspname = 'vp_meta') meta,
    to_regclass('vp_meta.environment') is not null tem_marca,
    to_regclass('vp_meta.migrations') is not null tem_registro,
    to_regclass('vp_meta.applied') is not null experimento,
    exists (select 1 from pg_namespace where nspname = 'storage') storage,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','p','v','m','S')
        and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')) objetos_public`);
  s.marca = s.tem_marca ? (await q("select name from vp_meta.environment")).rows.map((r) => r.name) : [];
  s.aplicadas = s.tem_registro ? (await q("select arquivo, sha256 from vp_meta.migrations order by arquivo")).rows : [];
  return s;
}

function conferirMarca(s, ambiente) {
  if (s.marca.length !== 1 || s.marca[0] !== ambiente) recusar(`a marca do banco (${s.marca.join(",") || "nenhuma"}) não é "${ambiente}"`);
}

function pendentes(lista, aplicadas) {
  aplicadas.forEach((a, i) => {
    const f = lista[i];
    if (!f || f.arquivo !== a.arquivo) recusar(`a migration aplicada ${a.arquivo} não corresponde aos arquivos atuais (${f?.arquivo ?? "ausente"})`);
    if (f.sha256 !== a.sha256) recusar(`o arquivo ${a.arquivo} foi alterado depois de aplicado (impressão digital diferente)`);
  });
  return lista.slice(aplicadas.length);
}

const MARCA_SQL = (ambiente, rotulo) => `
  create schema vp_meta;
  revoke all on schema vp_meta from public;
  create table vp_meta.environment (
    name text primary key check (name in ('local', 'homolog', 'production')),
    label text not null, marked_at timestamptz not null default now());
  create table vp_meta.migrations (
    arquivo text primary key, sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
    aplicado_em timestamptz not null default now());
  insert into vp_meta.environment (name, label) values (${lit(ambiente)}, ${lit(rotulo)});`;
const lit = (s) => `'${String(s).replaceAll("'", "''")}'`;

// Configuração criada pelas próprias migrations (sem dados de pessoas): não conta como dado.
const CONFIGURACAO = ["storage.buckets", "public.ai_settings", "public.portal_settings"];

// Conta linhas de todas as tabelas da aplicação e dos usuários do Neon Auth.
async function contarDados(q) {
  const { rows: tabelas } = await q(`select format('%I.%I', schemaname, tablename) t from pg_tables
    where schemaname in ('public', 'storage', 'neon_auth') and tablename not like '\\_tap%'
      and (schemaname <> 'neon_auth' or tablename in ('user', 'session', 'account'))
      and format('%I.%I', schemaname, tablename) <> all ($1)`, [CONFIGURACAO]);
  const comDados = [];
  for (const { t } of tabelas) {
    const { rows: [r] } = await q(`select count(*)::int n from ${t}`);
    if (r.n) comDados.push(`${t}=${r.n}`);
  }
  return comDados;
}

// Apaga só os objetos da aplicação: schemas storage e vp_meta, e tudo em public que
// não pertença a uma extensão (pgcrypto, pg_session_jwt ficam). neon_auth não é tocado.
async function apagarAplicacao(q) {
  await q("drop schema if exists storage cascade; drop schema if exists vp_meta cascade;");
  const naoExt = (cat, col = "oid") => `not exists (select 1 from pg_depend d where d.classid = '${cat}'::regclass and d.objid = x.${col} and d.deptype = 'e')`;
  const { rows: rels } = await q(`select format('%I.%I', n.nspname, x.relname) nome, x.relkind from pg_class x join pg_namespace n on n.oid = x.relnamespace
    where n.nspname = 'public' and x.relkind in ('r','p','v','m','f') and ${naoExt("pg_class")}`);
  for (const r of rels) await q(`drop ${({ v: "view", m: "materialized view", f: "foreign table" })[r.relkind] ?? "table"} if exists ${r.nome} cascade`);
  const { rows: funcs } = await q(`select format('%I.%I(%s)', n.nspname, x.proname, pg_get_function_identity_arguments(x.oid)) nome, x.prokind
    from pg_proc x join pg_namespace n on n.oid = x.pronamespace where n.nspname = 'public' and ${naoExt("pg_proc")}`);
  for (const f of funcs) await q(`drop ${f.prokind === "p" ? "procedure" : f.prokind === "a" ? "aggregate" : "function"} if exists ${f.nome} cascade`);
  const { rows: tipos } = await q(`select format('%I.%I', n.nspname, x.typname) nome from pg_type x join pg_namespace n on n.oid = x.typnamespace
    where n.nspname = 'public' and x.typtype in ('e','d','c','r') and (x.typtype <> 'c' or (select relkind from pg_class where oid = x.typrelid) = 'c') and ${naoExt("pg_type")}`);
  for (const t of tipos) await q(`drop type if exists ${t.nome} cascade`);
  const { rows: seqs } = await q(`select format('%I.%I', n.nspname, x.relname) nome from pg_class x join pg_namespace n on n.oid = x.relnamespace
    where n.nspname = 'public' and x.relkind = 'S' and ${naoExt("pg_class")}`);
  for (const s of seqs) await q(`drop sequence if exists ${s.nome} cascade`);
  const s = await estado(q);
  if (s.meta || s.storage || s.objetos_public) throw new Error(`restaram objetos da aplicação: ${JSON.stringify(s)}`);
}

async function aplicarLista(q, lista) {
  for (const m of lista) {
    const t0 = Date.now();
    try { await q(m.sql); } catch (e) { throw new Error(`${m.arquivo}: ${e.message}`); }
    await q({ text: "insert into vp_meta.migrations (arquivo, sha256) values ($1, $2)", values: [m.arquivo, m.sha256] });
    console.log(`  ✓ ${m.arquivo} (${Date.now() - t0} ms)`);
  }
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(3).map((a) => {
    const m = a.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (!m) throw new Error(`argumento desconhecido: ${a}`);
    return [m[1], m[2] ?? true];
  }));
  const comando = process.argv[2] ?? "verificar";
  const DIR = args.dir ? String(args.dir) : new URL("./migrations/", import.meta.url).pathname;
  if (!["verificar", "aplicar", "recriar"].includes(comando)) recusar(`comando desconhecido: ${comando}`);
  const lista = lerMigrations(DIR);
  const { client, ambiente, rotulo, branch } = await conectar();
  const q = (t, v) => client.query(v ? { text: t, values: v } : t);
  try {
    console.log(`Banco: ${rotulo} · branch ${branch}`);
    if (comando !== "verificar" && args.branch !== branch) recusar(`--branch=${args.branch === true ? "" : args.branch ?? ""} não confere com o branch conectado (${branch})`);

    await q("begin");
    await q("select pg_advisory_xact_lock(hashtext('vitrineplayer:migrar'))");
    const s = await estado(q);

    if (comando === "recriar") {
      if (args["confirmar-recriar"] !== branch) recusar("para recriar, repita o branch em --confirmar-recriar=<id>");
      if (!s.marca.length) recusar("banco sem a marca do ambiente: recriar não é permitido");
      conferirMarca(s, ambiente);
      const dados = await contarDados(q);
      if (dados.length) recusar(`o banco tem dados (${dados.join(", ")}): recriar não é permitido`);
      console.log("  sem dados; apagando objetos da aplicação (neon_auth e extensões ficam)");
      await apagarAplicacao(q);
      await q(MARCA_SQL(ambiente, rotulo));
      await aplicarLista(q, lista);
    } else {
      if (s.experimento && !s.tem_registro) recusar("o banco tem o schema do experimento (vp_meta.applied): use recriar");
      if (!s.meta) {
        if (s.storage || s.objetos_public) recusar("banco sem marca e não está vazio");
        if (comando === "verificar") { console.log(`Banco vazio, sem marca. Pendentes: ${lista.length}`); await q("rollback"); return; }
        if (!args.marcar) recusar("banco vazio sem marca: use --marcar para gravar a marca do ambiente");
        await q(MARCA_SQL(ambiente, rotulo));
        s.aplicadas = [];
      } else {
        conferirMarca(s, ambiente);
        if (!s.tem_registro) recusar("banco com marca mas sem registro de migrations");
      }
      const falta = pendentes(lista, s.aplicadas);
      if (comando === "verificar") {
        console.log(`Aplicadas: ${s.aplicadas.length} · pendentes: ${falta.length}${falta.length ? " (" + falta.map((m) => m.arquivo).join(", ") + ")" : " — em dia"}`);
        await q("rollback");
        return;
      }
      if (!falta.length) { console.log("Nada a aplicar: em dia."); await q("rollback"); return; }
      await aplicarLista(q, falta);
    }
    await q("commit");
    const { rows: [n] } = await q("select count(*)::int n from vp_meta.migrations");
    console.log(`Concluído: ${n.n} migrations registradas.`);
  } catch (e) {
    await q("rollback").catch(() => {});
    throw e;
  } finally {
    await client.end().catch(() => {});
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => {
  const recusa = e instanceof Recusa || String(e.message).startsWith("RECUSADO");
  console.error(`${recusa ? "RECUSADO" : "ERRO"}: ${String(e.message).replace(/^RECUSADO: /, "")} (nada foi alterado)`);
  process.exit(recusa ? 2 : 1);
});
