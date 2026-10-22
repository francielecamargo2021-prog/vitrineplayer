// Gera src/lib/auth/common-passwords.ts a partir de listas públicas (SecLists, licença MIT):
//   node scripts/gerar-senhas-comuns.mjs <100k-most-used-passwords-NCSC.txt> <10k-most-common.txt>
// Baixe os arquivos de github.com/danielmiessler/SecLists (Passwords/Common-Credentials).
// Nada é consultado fora do servidor: a lista fica no próprio projeto.
import { readFileSync, writeFileSync } from "node:fs";
import { normalizePassword } from "../src/lib/auth/password-policy.ts";

const [ncsc, top10k] = process.argv.slice(2);
if (!ncsc || !top10k) throw new Error("uso: node scripts/gerar-senhas-comuns.mjs <ncsc-100k> <10k-most-common>");
const lines = (f) => readFileSync(f, "utf8").split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean);

// Termos do nosso público (pt/es): clubes, futebol, família, fé, o próprio site.
const LOCAL = `senha minhasenha novasenha trocarsenha contrasena micontrasena clave futebol futbol futebolclube
bola gol golaco jogador jogadora atleta atletas craque campeao campeon campeonato escolinha peneira
flamengo mengao mengo corinthians timao palmeiras verdao saopaulo santos gremio internacional colorado
cruzeiro atletico galo vasco botafogo fluminense bahia vitoria sport fortaleza ceara coritiba athletico
goias brasil brasileiro selecao argentina uruguay uruguai paraguay boca bocajuniors river riverplate racing
independiente sanlorenzo penarol nacional colocolo velez messi neymar ronaldo cristiano pele vini viniciusjr
familia filho filha meufilho minhafilha mamae papai amor meuamor teamo teamomucho jesus jesuscristo deus
deusefiel deuseamor gracias obrigado obrigada vitrine vitrineplayer player`.split(/\s+/);

const full = [...new Set(lines(ncsc).filter((p) => p.length >= 10 && p.length <= 64 && /^[\x20-\x7e]+$/.test(p)))].sort();
const bases = [...new Set([...lines(top10k).filter((p) => /^[a-z]{4,}$/.test(p)), ...LOCAL].map(normalizePassword))]
  .filter((b) => b.length >= 4).sort();

const out = `// GERADO por scripts/gerar-senhas-comuns.mjs — não edite à mão.
// Fonte: SecLists (MIT), Passwords/Common-Credentials: 100k-most-used-passwords-NCSC e 10k-most-common,
// mais termos comuns do nosso público. ${full.length} senhas longas e ${bases.length} palavras-base.
export const COMMON_FULL = ${JSON.stringify(full.join("\n"))};
export const COMMON_BASES = ${JSON.stringify(bases.join("\n"))};
`;
writeFileSync(new URL("../src/lib/auth/common-passwords.ts", import.meta.url), out);
console.log(`ok: ${full.length} senhas, ${bases.length} bases`);
