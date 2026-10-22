// Prepara os arquivos do teste local contra a homologação SEM imprimir nenhum valor.
//   VP_HOMOLOG_DB_URL (variável do ambiente) ou VP_DB_URL_FILE (arquivo) → endereço do banco
//   node scripts/preparar-homolog.mjs <pasta-temporária>
// Cria, com permissão só do dono (600): homolog.url e app.env (valores entre aspas simples,
// para caracteres como & não virarem comandos do shell). Segredos locais são gerados na hora.
// Ao terminar os testes: shred -u <pasta>/homolog.url <pasta>/app.env
import { randomBytes } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("uso: node scripts/preparar-homolog.mjs <pasta-temporária>");
const url = (process.env.VP_HOMOLOG_DB_URL ?? (process.env.VP_DB_URL_FILE ? readFileSync(process.env.VP_DB_URL_FILE, "utf8") : "")).trim();
if (!/^postgres(ql)?:\/\//.test(url)) throw new Error("endereço do banco ausente (defina VP_HOMOLOG_DB_URL ou VP_DB_URL_FILE)");
if (!url.includes("ep-damp-cherry-b6vxcwaj")) throw new Error("RECUSADO: o endereço não é o da homologação");
const q = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
const env = {
  VP_ENV: "homolog",
  DATABASE_URL: url,
  NEON_AUTH_BASE_URL: "https://ep-damp-cherry-b6vxcwaj.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth",
  NEON_DATA_API_URL: "https://ep-damp-cherry-b6vxcwaj.apirest.c-2.sa-east-1.aws.neon.tech/neondb/rest/v1",
  NEON_AUTH_COOKIE_SECRET: randomBytes(32).toString("hex"),
  ADMIN_MFA_KEY: randomBytes(32).toString("base64url"),
  BLOB_READ_WRITE_TOKEN: "teste-local-sem-uso",
  AI_ANALYSIS_ENABLED: "false",
};
const write = (f, text) => { writeFileSync(f, text, { mode: 0o600 }); chmodSync(f, 0o600); };
write(join(dir, "homolog.url"), url);
write(join(dir, "app.env"), Object.entries(env).map(([k, v]) => `${k}=${q(v)}`).join("\n") + "\n");
console.log("ok: homolog.url e app.env criados (nenhum valor exibido)");
