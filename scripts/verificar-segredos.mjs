// Procura credenciais nos arquivos do repositório (versionados e novos, fora do .gitignore).
// Mostra só o arquivo, a linha e o TIPO encontrado — nunca o valor.  npm run check:secrets
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const RULES = [
  ["endereço Postgres com senha", /postgres(?:ql)?:\/\/[^\s:@/'"`]+:[^\s@'"`$<{]{6,}@/i],
  ["senha do Neon (npg_)", /\bnpg_[A-Za-z0-9]{8,}/],
  ["token do Vercel Blob", /\bvercel_blob_rw_[A-Za-z0-9]{16,}/],
  ["chave privada", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["token do GitHub", /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ["chave de API (sk-)", /\bsk-[A-Za-z0-9_-]{24,}/],
  ["chave do Google (AIza)", /\bAIza[0-9A-Za-z_-]{30,}/],
];
const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\0").filter((f) => f && !/(^|\/)(package-lock\.json|common-passwords\.ts)$/.test(f));
let found = 0;
for (const f of files) {
  let text;
  try { text = readFileSync(f, "utf8"); } catch { continue; }
  if (text.includes("\0")) continue; // binário
  text.split("\n").forEach((line, i) => {
    for (const [kind, re] of RULES) if (re.test(line)) { console.log(`✗ ${f}:${i + 1} — ${kind}`); found++; }
  });
}
console.log(found ? `\n${found} possível(is) credencial(is). Remova antes de salvar no repositório.` : `ok: ${files.length} arquivos sem credenciais`);
process.exit(found ? 1 : 0);
