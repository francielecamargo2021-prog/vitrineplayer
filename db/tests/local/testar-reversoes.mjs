// Scripts de volta (db/reversoes/*.sql), testados no Postgres local (chamado por run.sh):
//   1. com todas as migrations aplicadas, tira a "foto" do catálogo (funções, tabelas,
//      políticas, permissões, gatilhos e registro de migrations);
//   2. aplica a reversão e confere que só sumiram os objetos daquela migration;
//   3. reaplica a migration com o migrar.mjs e confere que o catálogo voltou idêntico.
import pg from "pg";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const db = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const client = new pg.Client({ connectionString: process.env.VP_DB_URL });
await client.connect();
const q = async (t) => (await client.query(t)).rows;

const SNAP = `
  select 'f:' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' || md5(pg_get_functiondef(p.oid)) || coalesce(array_to_string(p.proacl, ','), '') as o
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'storage', 'vp_meta') and p.prokind = 'f'
  union all
  select 't:' || c.oid::regclass::text || ':' || c.relkind::text || ':' || coalesce(array_to_string(c.relacl, ','), '') || c.relrowsecurity::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'storage', 'vp_meta') and c.relkind in ('r', 'v', 'm', 'i', 'S')
  union all
  select 'p:' || schemaname || '.' || tablename || ':' || policyname || ':' || cmd::text || ':' || coalesce(qual, '') || coalesce(with_check, '') from pg_policies
  union all
  select 'g:' || tgname || ':' || tgrelid::regclass::text from pg_trigger where not tgisinternal
  union all
  select 'm:' || arquivo || ':' || sha256 from vp_meta.migrations`;
const snapshot = async () => new Set((await q(SNAP)).map((r) => r.o));
const diff = (a, b) => [...a].filter((x) => !b.has(x));

let failed = 0;
const check = (ok, msg, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${msg}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};
const migrar = (...args) => execFileSync("node", [join(db, "migrar.mjs"), ...args], { encoding: "utf8", env: process.env });

for (const file of readdirSync(join(db, "reversoes")).filter((f) => f.endsWith(".sql")).sort().reverse()) {
  const name = file.replace(/\.sql$/, "");
  const before = await snapshot();
  await client.query(readFileSync(join(db, "reversoes", file), "utf8"));
  const after = await snapshot();
  const removed = diff(before, after);
  const added = diff(after, before);
  check(added.length === 0, `${name}: a reversão não cria nem altera nada`, added.slice(0, 3).join(" | "));
  check(removed.length > 0 && removed.some((x) => x.startsWith(`m:${file}`)), `${name}: a reversão remove os objetos da migration e o registro dela`, `${removed.length} objetos`);
  check(/pendentes: 1 \(/.test(migrar("verificar")), `${name}: o migrar.mjs volta a ver a migration como pendente`);
  migrar("aplicar", "--branch=local");
  const again = await snapshot();
  check(diff(before, again).length === 0 && diff(again, before).length === 0, `${name}: reaplicar deixa o banco idêntico ao de antes da reversão`);
}
await client.end();
console.log(failed ? `\n${failed} falha(s) nas reversões` : "\nReversões: tudo ok");
process.exit(failed ? 1 : 0);
