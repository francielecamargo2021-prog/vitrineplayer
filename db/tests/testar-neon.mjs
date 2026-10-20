// Roda os testes de banco (pgTAP real do Neon) no banco configurado (VP_ENV + VP_DB_URL_FILE).
// Cada arquivo começa com begin e termina com rollback: nenhum dado fica gravado.
// Também testa, numa conexão NOVA, o comportamento do Neon que apaga a identificação
// (request.jwt.claims) no primeiro carregamento da extensão pg_session_jwt.
import { readFileSync, readdirSync } from "node:fs";
import { conectar } from "../conexao.mjs";

const dir = new URL("./", import.meta.url).pathname;
let falhas = 0, total = 0;

// 1. Conexão nova: vp_uid() precisa enxergar a identificação definida com SET LOCAL
{
  const { client } = await conectar();
  const sub = "e0000000-0000-0000-0000-0000000000a1";
  try {
    await client.query("begin");
    await client.query(`select set_config('request.jwt.claims', '{"sub":"${sub}","role":"authenticated"}', true)`);
    const { rows: [a] } = await client.query("select public.vp_uid()::text u");
    const okA = a.u === sub;
    console.log(`${okA ? "✓" : "✗"} conexão nova: vp_uid() lê a identificação definida pelo servidor`);
    // Informativo: o que acontece se alguém chamar a extensão do Neon antes
    let info = "auth.user_id() indisponível para este papel";
    try {
      await client.query("savepoint s");
      await client.query("select auth.user_id()");
      const { rows: [b] } = await client.query("select public.vp_uid()::text u");
      info = b.u === sub ? "a identificação continuou valendo" : "a identificação foi APAGADA (por isso a aplicação usa só vp_uid())";
    } catch { await client.query("rollback to savepoint s"); }
    console.log(`  ℹ depois de carregar pg_session_jwt: ${info}`);
    await client.query("rollback");
    total++; if (!okA) falhas++;
  } finally {
    await client.end();
  }
}

// 2. Testes pgTAP
const { client } = await conectar();
try {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".test.sql")).sort()) {
    let results;
    try {
      results = await client.query(readFileSync(dir + f, "utf8"));
    } catch (e) {
      await client.query("rollback").catch(() => {});
      console.log(`✗ ${f}: erro de execução — ${e.message}`);
      falhas++;
      continue;
    }
    const lines = (Array.isArray(results) ? results : [results])
      .flatMap((r) => r.rows ?? []).flatMap((row) => Object.values(row))
      .filter((v) => typeof v === "string").flatMap((v) => v.split("\n"));
    const oks = lines.filter((l) => /^ok \d+/.test(l)).length;
    const nok = lines.filter((l) => /^not ok \d+/.test(l)).length;
    total += oks + nok;
    if (nok || lines.some((l) => /^# Looks like/.test(l))) {
      falhas++;
      console.log(`✗ ${f} (${oks} ok, ${nok} falhas)`);
      for (const l of lines.filter((l) => /^not ok|^#/.test(l))) console.log("   " + l);
    } else console.log(`✓ ${f} (${oks} asserções, pgTAP real)`);
  }
  const { rows: [left] } = await client.query(`select (select count(*)::int from neon_auth."user") usuarios, (select count(*)::int from athletes) atletas`);
  console.log(`\nTotal: ${total} verificações · dados que sobraram: ${left.usuarios} usuários, ${left.atletas} atletas`);
} finally {
  await client.end();
}
process.exit(falhas ? 1 : 0);
