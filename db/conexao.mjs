// Conexão com o banco, com travas de ambiente.
//
// O endereço vem de um ARQUIVO (VP_DB_URL_FILE), nunca da linha de comando, para a
// senha não aparecer em históricos. Para o Postgres local de teste, VP_DB_URL também
// é aceito (só endereço local, sem senha).
//
// Travas (todas antes de qualquer comando):
//  1. VP_ENV precisa ser um ambiente conhecido. "production" ainda não é aceito.
//  2. O banco precisa provar quem é: no Neon, current_setting('neon.project_id')
//     tem de ser o projeto daquele ambiente. "local" só aceita endereço local.
//  3. Quem chama recebe o branch real (neon.branch_id) para conferir com --branch.
import { readFileSync } from "node:fs";

export const AMBIENTES = {
  homolog: { projeto: "rough-mode-32600282", rotulo: "vitrineplayer-homolog (Neon)", local: false },
  local: { projeto: "vp-local", rotulo: "Postgres local de teste", local: true },
};

function lerEndereco() {
  const file = process.env.VP_DB_URL_FILE;
  if (file) return readFileSync(file, "utf8").trim();
  if (process.env.VP_DB_URL) return process.env.VP_DB_URL;
  throw new Error("defina VP_DB_URL_FILE (arquivo com o endereço do banco)");
}

function ehLocal(url) {
  const u = new URL(url.replace(/^postgres(ql)?:/, "http:"));
  const socket = u.searchParams.get("host");
  if (u.password) return false;
  return ["localhost", "127.0.0.1", "::1", ""].includes(u.hostname) || Boolean(socket?.startsWith("/"));
}

export async function conectar() {
  const nome = process.env.VP_ENV;
  if (nome === "production") throw new Error("RECUSADO: produção ainda não é aceita por este script");
  const amb = AMBIENTES[nome];
  if (!amb) throw new Error(`RECUSADO: VP_ENV deve ser ${Object.keys(AMBIENTES).join(" ou ")}`);
  const url = lerEndereco();
  const local = ehLocal(url);
  if (amb.local !== local) throw new Error(`RECUSADO: o ambiente ${nome} ${amb.local ? "só aceita banco local" : "não aceita banco local"}`);

  let client;
  if (local) {
    const pg = (await import("pg")).default;
    client = new pg.Client({ connectionString: url });
  } else {
    const { Client, neonConfig } = await import("@neondatabase/serverless");
    const { default: WebSocket } = await import("ws");
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    if (proxy) {
      const { HttpsProxyAgent } = await import("https-proxy-agent");
      neonConfig.webSocketConstructor = class extends WebSocket {
        constructor(u, protocols) { super(u, protocols, { agent: new HttpsProxyAgent(proxy) }); }
      };
    } else neonConfig.webSocketConstructor = WebSocket;
    client = new Client(url);
  }
  client.on?.("error", () => {});
  await client.connect();
  try {
    const { rows: [id] } = await client.query(`select current_database() banco,
      current_setting('neon.project_id', true) projeto, current_setting('neon.branch_id', true) branch`);
    if (id.projeto !== amb.projeto) throw new Error(`RECUSADO: o banco não é o do ambiente ${nome} (projeto "${id.projeto ?? "desconhecido"}")`);
    return { client, ambiente: nome, rotulo: amb.rotulo, banco: id.banco, branch: id.branch };
  } catch (e) {
    await client.end().catch(() => {});
    throw e;
  }
}
