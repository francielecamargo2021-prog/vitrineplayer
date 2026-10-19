// Aplica no banco de homologação: marca do ambiente → compat/antes → migrations
// (gerado/) → compat/depois. Cada arquivo numa transação; recusa reaplicar.
import { readFileSync, readdirSync } from "node:fs";
import { connect } from "./db.mjs";

const here = new URL("./", import.meta.url).pathname;
const { client } = await connect();
const q = (sql) => client.query(sql);
try {
  const { rows: [st] } = await q(`select
    exists (select 1 from pg_namespace where nspname = 'vp_meta') marked,
    (select count(*)::int from pg_tables where schemaname = 'public') public_tables`);
  if (st.marked) throw new Error("banco já tem a marca vp_meta: as migrations já foram aplicadas (nada foi feito)");
  if (st.public_tables > 0) throw new Error("schema public não está vazio (nada foi feito)");

  const steps = [
    ["marca de homologação", `create schema vp_meta; revoke all on schema vp_meta from public;
      create table vp_meta.environment (name text primary key check (name in ('homolog','production')), label text not null, marked_at timestamptz not null default now());
      insert into vp_meta.environment values ('homolog', 'vitrineplayer-homolog (Neon)');
      create table vp_meta.applied (step text primary key, applied_at timestamptz not null default now());`],
    ["compat/antes.sql", readFileSync(here + "compat/antes.sql", "utf8")],
    ...readdirSync(here + "gerado/migrations").sort().map((f) => [f, readFileSync(here + "gerado/migrations/" + f, "utf8")]),
    ["compat/depois.sql", readFileSync(here + "compat/depois.sql", "utf8")],
  ];
  for (const [name, sql] of steps) {
    const t0 = Date.now();
    await q("begin");
    try {
      await q(sql);
      await q({ text: "insert into vp_meta.applied (step) values ($1)", values: [name] }).catch(async (e) => { if (name !== "marca de homologação") throw e; });
      await q("commit");
    } catch (e) {
      await q("rollback");
      throw new Error(`${name}: ${e.message}`);
    }
    console.log(`✓ ${name} (${Date.now() - t0} ms)`);
  }
  await q("insert into vp_meta.applied (step) values ('marca de homologação') on conflict do nothing");
} finally {
  await client.end();
}
