import "server-only";
import { asService, dbReady } from "@/lib/db";
import { makePvRepo, type PvDbRepo } from "./repo-sql.ts";

/**
 * Repositório da integração no Neon, pela conexão de SERVIÇO (asService), usado só pelo ciclo e pelo
 * webhook. As funções pv_* (0016) conferem o papel de serviço; nada daqui chega ao navegador.
 * O SQL fica em repo-sql.ts (o mesmo que o teste ponta a ponta executa num Postgres local).
 */
export type { PvDbRepo } from "./repo-sql.ts";

export function pvRepo(): PvDbRepo | null {
  if (!dbReady()) return null;
  return makePvRepo(<T,>(text: string, params: unknown[]) => asService<T>((q) => q.query(text, params)));
}
