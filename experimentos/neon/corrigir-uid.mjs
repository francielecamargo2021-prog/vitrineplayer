// Correção no lugar (sem apagar tabelas nem dados): troca auth.uid() por
// public.vp_uid() em funções, políticas RLS e valores padrão já aplicados.
// Lê o catálogo do próprio banco, monta os comandos e executa numa transação.
import { readFileSync } from "node:fs";
import { connect } from "./db.mjs";

const { client } = await connect();
const q = (t, v) => client.query(v ? { text: t, values: v } : t);
const sub = (s) => s.replaceAll("auth.uid()", "public.vp_uid()");
try {
  await q("begin");
  // vp_uid() precisa existir antes
  const antes = readFileSync(new URL("./compat/antes.sql", import.meta.url), "utf8");
  const fn = antes.slice(antes.indexOf("create or replace function public.vp_uid()"), antes.indexOf("create or replace function public.request_role()"));
  await q(fn);

  const { rows: funcs } = await q(`select p.oid, pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','storage') and p.prokind = 'f' and p.proname <> 'vp_uid' and pg_get_functiondef(p.oid) like '%auth.uid()%'`);
  for (const f of funcs) await q(sub(f.def));

  const { rows: pols } = await q(`select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies
    where schemaname in ('public','storage') and (coalesce(qual,'') like '%auth.uid()%' or coalesce(with_check,'') like '%auth.uid()%')`);
  for (const p of pols) {
    const tbl = `${p.schemaname}.${JSON.stringify(p.tablename)}`;
    const roles = (Array.isArray(p.roles) ? p.roles : String(p.roles).replace(/[{}]/g, "").split(",")).join(", ");
    await q(`drop policy ${JSON.stringify(p.policyname)} on ${tbl}`);
    await q(`create policy ${JSON.stringify(p.policyname)} on ${tbl} as ${p.permissive} for ${p.cmd} to ${roles}`
      + (p.qual ? ` using (${sub(p.qual)})` : "") + (p.with_check ? ` with check (${sub(p.with_check)})` : ""));
  }

  const { rows: defs } = await q(`select n.nspname, c.relname, a.attname, pg_get_expr(d.adbin, d.adrelid) expr from pg_attrdef d
    join pg_class c on c.oid = d.adrelid join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where n.nspname in ('public','storage') and (pg_get_expr(d.adbin, d.adrelid) like '%auth.uid()%' or pg_get_expr(d.adbin, d.adrelid) like '%auth.user_id()%')`);
  for (const d of defs) await q(`alter table ${d.nspname}.${JSON.stringify(d.relname)} alter column ${JSON.stringify(d.attname)} set default ${sub(d.expr).replaceAll("auth.user_id()", "(public.vp_uid())::text")}`);

  const { rows: [left] } = await q(`select
    (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','storage') and p.prokind = 'f' and p.proname<>'vp_uid' and pg_get_functiondef(p.oid) like '%auth.uid()%') funcs,
    (select count(*)::int from pg_policies where schemaname in ('public','storage') and (coalesce(qual,'') like '%auth.uid()%' or coalesce(with_check,'') like '%auth.uid()%')) pols`);
  if (left.funcs || left.pols) throw new Error(`ainda restam referências: ${JSON.stringify(left)}`);
  await q("insert into vp_meta.applied (step) values ('correção auth.uid → vp_uid')");
  await q("commit");
  console.log(`✓ ${funcs.length} funções, ${pols.length} políticas e ${defs.length} valores padrão corrigidos (nenhuma tabela apagada)`);
} catch (e) {
  await q("rollback").catch(() => {});
  console.log("✗ nada foi alterado:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
