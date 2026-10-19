// Conexão com o banco de HOMOLOGAÇÃO (WebSocket do Neon, via proxy do ambiente).
// Recusa qualquer endereço que não seja o do projeto vitrineplayer-homolog.
import { readFileSync } from "node:fs";
import { Client, neonConfig } from "@neondatabase/serverless";
import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";

export const HOMOLOG_ENDPOINT = "ep-damp-cherry-b6vxcwaj";
export function env() {
  const file = process.env.NEON_ENV_FILE;
  if (!file) throw new Error("defina NEON_ENV_FILE");
  return Object.fromEntries(readFileSync(file, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
}
export async function connect() {
  const e = env();
  const host = new URL(e.NEON_HOMOLOG_URL.replace(/^postgresql:/, "http:")).hostname;
  if (!host.startsWith(HOMOLOG_ENDPOINT + ".") ) throw new Error(`RECUSADO: ${host} não é o banco de homologação`);
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  neonConfig.webSocketConstructor = proxy
    ? class extends WebSocket { constructor(url, protocols) { super(url, protocols, { agent: new HttpsProxyAgent(proxy) }); } }
    : WebSocket;
  const client = new Client(e.NEON_HOMOLOG_URL);
  await client.connect();
  const { rows } = await client.query("select current_database() db, (select name from neon_auth.project_config limit 1) cfg");
  return { client, info: rows[0] };
}
