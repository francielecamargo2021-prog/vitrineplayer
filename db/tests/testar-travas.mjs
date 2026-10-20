// Testa as travas do migrar.mjs contra o banco configurado (VP_ENV + VP_DB_URL_FILE/VP_DB_URL).
// Roda no Postgres local (run.sh) e no branch temporário do Neon. NÃO usar no banco principal:
// o teste termina com "recriar", que apaga e refaz as tabelas (só funciona sem dados).
// Dados fictícios criados aqui são apagados no fim.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, unlinkSync, appendFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conectar } from "../conexao.mjs";
import { lerMigrations } from "../migrar.mjs";

const DB = new URL("../", import.meta.url).pathname;
const ORIG = join(DB, "migrations");
const { client, ambiente, branch } = await conectar();
const q = (t, v) => client.query(v ? { text: t, values: v } : t);
let ok = 0, bad = 0;
const check = (c, d, x = "") => { console.log(`${c ? "✓" : "✗"} ${d}${x ? ` — ${x}` : ""}`); c ? ok++ : bad++; };

function migrar(args, env = {}) {
  const r = spawnSync(process.execPath, [join(DB, "migrar.mjs"), ...args], { env: { ...process.env, ...env }, encoding: "utf8" });
  return { code: r.status, out: (r.stdout + r.stderr).trim().split("\n").pop() };
}
const recusou = (r, trecho) => r.code === 2 && (!trecho || r.out.includes(trecho));
const copia = () => { const d = mkdtempSync(join(tmpdir(), "vp-migr-")); cpSync(ORIG, d, { recursive: true }); return d; };
const registro = async () => (await q("select arquivo, sha256 from vp_meta.migrations order by arquivo")).rows.map((r) => r.arquivo + ":" + r.sha256).join("|");
const existe = async (t) => (await q("select to_regclass($1) is not null e", [t])).rows[0].e;

if (process.env.VP_ENV === "homolog" && branch === "br-steep-glitter-b6dfr3z6") {
  console.error("RECUSADO: este teste não roda no branch principal da homologação");
  process.exit(2);
}
const temp = [];
try {
  const antes = await registro();
  const B = `--branch=${branch}`;

  let r = migrar(["verificar"]);
  check(r.code === 0 && r.out.includes("em dia"), "verificar: banco em dia, sem alterar nada", r.out);

  r = migrar(["aplicar"]);
  check(recusou(r, "não confere"), "aplicar sem --branch é recusado", r.out);
  r = migrar(["aplicar", "--branch=br-outro-branch"]);
  check(recusou(r, "não confere"), "aplicar com branch errado é recusado", r.out);
  r = migrar(["aplicar", B]);
  check(r.code === 0 && r.out.includes("Nada a aplicar") && (await registro()) === antes, "reaplicar não repete nada", r.out);

  r = migrar(["aplicar", B], { VP_ENV: "production" });
  check(recusou(r, "produção"), "ambiente de produção é recusado", r.out);
  r = migrar(["verificar"], { VP_ENV: ambiente === "local" ? "homolog" : "local" });
  check(recusou(r), `banco ${ambiente} usado como outro ambiente é recusado`, r.out);
  r = migrar(["verificar"], { VP_ENV: "qualquer" });
  check(recusou(r, "VP_ENV"), "ambiente desconhecido é recusado", r.out);

  let d = copia(); temp.push(d);
  appendFileSync(join(d, "0003_international_profile.sql"), "\n-- alteração depois de aplicado\n");
  r = migrar(["aplicar", B, `--dir=${d}`]);
  check(recusou(r, "alterado depois de aplicado"), "arquivo alterado depois de aplicado é recusado", r.out);

  d = copia(); temp.push(d);
  unlinkSync(join(d, "0004_ai_video_analysis.sql"));
  r = migrar(["aplicar", B, `--dir=${d}`]);
  check(recusou(r, "sequência quebrada"), "arquivo faltando na sequência é recusado", r.out);

  d = copia(); temp.push(d);
  writeFileSync(join(d, "0003_duplicado.sql"), "select 1;\n");
  r = migrar(["aplicar", B, `--dir=${d}`]);
  check(recusou(r, "sequência quebrada"), "número de migration repetido é recusado", r.out);

  d = copia(); temp.push(d);
  writeFileSync(join(d, "0007 sem padrao.sql"), "select 1;\n");
  r = migrar(["aplicar", B, `--dir=${d}`]);
  check(recusou(r, "fora do padrão"), "nome fora do padrão é recusado", r.out);

  const n = lerMigrations(ORIG).length;
  const prox = String(n).padStart(4, "0");
  d = copia(); temp.push(d);
  writeFileSync(join(d, `${prox}_teste_falha.sql`), "create table public.vp_teste_trava (x int);\nselect 1/0;\n");
  r = migrar(["aplicar", B, `--dir=${d}`]);
  check(r.code === 1 && !(await existe("public.vp_teste_trava")) && (await registro()) === antes,
    "migration com erro é desfeita por inteiro (nada fica pela metade)", r.out);

  d = copia(); temp.push(d);
  writeFileSync(join(d, `${prox}_teste_ok.sql`), "create table public.vp_teste_trava (x int);\nalter table public.vp_teste_trava enable row level security;\n");
  r = migrar(["aplicar", B, `--dir=${d}`]);
  check(r.code === 0 && (await existe("public.vp_teste_trava")), "migration nova é aplicada e registrada", r.out);
  r = migrar(["verificar"]);
  check(recusou(r, "não corresponde"), "registro com migration que não existe nos arquivos é recusado", r.out);

  r = migrar(["recriar", B]);
  check(recusou(r, "confirmar-recriar"), "recriar sem confirmação é recusado", r.out);
  r = migrar(["recriar", B, "--confirmar-recriar=br-outro-branch"]);
  check(recusou(r, "confirmar-recriar"), "recriar com confirmação errada é recusado", r.out);

  const fake = "f0000000-0000-0000-0000-0000000000f1";
  await q(`insert into neon_auth."user" (id, name, email, "emailVerified") values ($1, 'Teste Trava', 'vp-teste-trava@example.com', false)`, [fake]);
  r = migrar(["recriar", B, `--confirmar-recriar=${branch}`]);
  const aindaExiste = (await q("select count(*)::int n from profiles where id = $1", [fake])).rows[0].n === 1;
  check(recusou(r, "tem dados") && aindaExiste, "recriar com dados no banco é recusado (e os dados ficam)", r.out);
  await q(`delete from neon_auth."user" where id = $1`, [fake]);

  await q("update vp_meta.environment set name = 'production'");
  r = migrar(["aplicar", B, `--dir=${d}`]);
  const r2 = migrar(["recriar", B, `--confirmar-recriar=${branch}`]);
  check(recusou(r, "marca") && recusou(r2, "marca"), "banco com marca de produção é recusado (aplicar e recriar)", `${r.out} / ${r2.out}`);
  await q("update vp_meta.environment set name = $1", [ambiente]);

  r = migrar(["recriar", B, `--confirmar-recriar=${branch}`]);
  const esperado = lerMigrations(ORIG).map((m) => m.arquivo + ":" + m.sha256).join("|");
  check(r.code === 0 && !(await existe("public.vp_teste_trava")) && (await registro()) === esperado,
    "recriar sem dados refaz tudo do zero e registra as impressões digitais", r.out);
  r = migrar(["verificar"]);
  check(r.code === 0 && r.out.includes("em dia"), "depois de recriar: em dia", r.out);
} catch (e) {
  check(false, "erro inesperado", e.message);
} finally {
  await q(`delete from neon_auth."user" where email = 'vp-teste-trava@example.com'`).catch(() => {});
  for (const d of temp) rmSync(d, { recursive: true, force: true });
  await client.end();
}
console.log(`\nTravas: ${ok} ok, ${bad} falhas`);
process.exit(bad ? 1 : 0);
