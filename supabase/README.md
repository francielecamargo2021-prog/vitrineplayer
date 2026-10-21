# supabase/ — arquivo histórico

Versão original do banco, de quando a VitrinePlayer usava Supabase. **Não é usada pelo app
nem pelas ferramentas atuais.** O banco oficial é o Neon: migrations em `db/migrations/`,
aplicadas por `db/migrar.mjs` (ver `db/README.md`).

Fica aqui só como referência: `experimentos/neon/adaptar.mjs` lê `migrations/` e `tests/`
para documentar como 0001–0005 foram convertidas para o Neon. Nenhum dado nem recurso
externo do Supabase é acessado a partir deste repositório.
