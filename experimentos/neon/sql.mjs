// Executa SQL ad hoc no banco de homologação (diagnóstico). Uso: node sql.mjs "<sql>"
import { connect } from "./db.mjs";
const { client } = await connect();
try {
  const r = await client.query(process.argv[2]);
  for (const x of Array.isArray(r) ? r : [r]) if (x.rows?.length) console.log(JSON.stringify(x.rows, null, 1));
} catch (e) { console.log("ERRO:", e.message); await client.query("rollback").catch(() => {}); }
finally { await client.end(); }
