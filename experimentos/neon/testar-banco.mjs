// Roda os testes de banco (pgTAP real do Neon) no banco de homologação.
// Cada arquivo começa com begin e termina com rollback: nenhum dado fica gravado.
import { readFileSync, readdirSync } from "node:fs";
import { connect } from "./db.mjs";

const dir = new URL("./gerado/tests/", import.meta.url).pathname;
const { client } = await connect();
let failed = 0;
let total = 0;
try {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".test.sql")).sort()) {
    let results;
    try {
      results = await client.query(readFileSync(dir + f, "utf8"));
    } catch (e) {
      await client.query("rollback").catch(() => {});
      console.log(`✗ ${f}: erro de execução — ${e.message}`);
      failed++;
      continue;
    }
    const lines = (Array.isArray(results) ? results : [results])
      .flatMap((r) => r.rows ?? [])
      .flatMap((row) => Object.values(row))
      .filter((v) => typeof v === "string")
      .flatMap((v) => v.split("\n"));
    const oks = lines.filter((l) => /^ok \d+/.test(l)).length;
    const bad = lines.filter((l) => /^not ok \d+/.test(l) || /^# Looks like/.test(l));
    total += oks + lines.filter((l) => /^not ok \d+/.test(l)).length;
    if (bad.length) {
      failed++;
      console.log(`✗ ${f} (${oks} ok)`);
      for (const l of lines.filter((l) => /^not ok|^#/.test(l))) console.log("   " + l);
    } else console.log(`✓ ${f} (${oks} asserções, pgTAP real)`);
  }
  const { rows: [left] } = await client.query(`select (select count(*)::int from neon_auth."user") users, (select count(*)::int from athletes) athletes`);
  console.log(`\nTotal: ${total} asserções · dados que sobraram no banco: ${left.users} usuários, ${left.athletes} atletas`);
} finally {
  await client.end();
}
process.exit(failed ? 1 : 0);
