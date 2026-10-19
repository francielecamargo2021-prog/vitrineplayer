# Experimento Neon + Vercel (teste técnico isolado)

Não faz parte da aplicação. Nada em `src/` ou `supabase/` foi alterado.
Banco usado: projeto Neon **vitrineplayer-homolog** (`rough-mode-32600282`), São Paulo, plano gratuito.
Os scripts recusam qualquer endpoint que não seja o desse projeto (`db.mjs`).

| Arquivo | O que faz |
|---|---|
| `compat/antes.sql`, `compat/depois.sql` | Camada de compatibilidade Neon (registro de fotos, `vp_uid()`, `request_role()`, permissões, cadastro em 2 passos) |
| `adaptar.mjs` | Gera `gerado/` a partir das migrations e testes ORIGINAIS (lista as trocas em `gerado/TROCAS.md`) |
| `aplicar.mjs` | Aplica marca de homologação + compat + migrations no banco vazio (recusa reaplicar) |
| `corrigir-uid.mjs` | Correção feita no lugar durante o teste (sem apagar tabelas) |
| `testar-banco.mjs` | 132 asserções pgTAP (real) dentro de transações desfeitas |
| `testar-api.mjs` | 39 verificações de ponta a ponta: Neon Auth → JWT → Data API → autorização de fotos |
| `app-next/` + `testar-next.mjs` | App Next.js 16.3.8 mínimo com `@neondatabase/auth` testado em Chromium (11 verificações) |
| `RELATORIO.md` | Resultados, dificuldades e recomendação |

Credenciais ficam fora do repositório (arquivo indicado por `NEON_ENV_FILE`).
