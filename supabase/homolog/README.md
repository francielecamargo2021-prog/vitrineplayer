# Homologação da VitrinePlayer — passo a passo

Ambiente isolado, só com dados fictícios. A análise por IA continua desligada e não há chamadas pagas.
Cada passo depende da sua autorização. Nada aqui afeta outro projeto: todos os arquivos SQL
recusam rodar fora do projeto marcado como homologação.

## O que existe nesta pasta

| Arquivo | Para que serve | Altera o banco? |
|---|---|---|
| `passos/00_marcar_homologacao.sql` | Confere que o projeto está vazio e o marca como homologação | Sim (uma vez) |
| `passos/01…05_migration_*.sql` | As migrations 0001–0005, sem nenhuma mudança, com travas e registro | Sim |
| `verificar.sql` | 11 conferências de segurança (IA desligada, RLS, funções fechadas…) | Não (só leitura) |
| `dados-teste.sql` | Organizações fictícias `[TESTE]` | Sim (pode repetir) |
| `tornar-admin.sql` | Torna a sua conta administradora | Sim |
| `simular-pagamento.sql` | Faz o papel do gateway para um atleta de teste | Sim |
| `testar-local.sh` | Ensaio de tudo isso num PostgreSQL local (sem rede) | — |

Os arquivos `passos/01…05` são gerados por `scripts/homolog/gerar-passos.sh` a partir de
`supabase/migrations/`. O ensaio local confere que eles continuam idênticos às migrations.

## Travas

- **Projeto errado:** o passo 00 só roda num projeto **vazio**; os demais só rodam num projeto marcado como homologação.
- **Ordem errada:** cada migration exige a anterior.
- **Repetição:** uma migration já aplicada é recusada sem alterar nada.
- **Transação única:** se qualquer linha de um passo falhar, nada daquele passo é gravado.
- **Sem apagar:** nenhum arquivo apaga ou recria o banco. Isso só acontece com a sua autorização expressa.

## Roteiro (um passo de cada vez, com a sua autorização)

**A. Criar o projeto (você).**
Organização nova no Supabase, por exemplo "VitrinePlayer Homolog", e dentro dela um projeto `vitrineplayer-homolog`.
Escolha a região São Paulo (`sa-east-1`) e o plano gratuito. Guarde a senha do banco num gerenciador de senhas; ela não é usada aqui.

**B. Configurar o login (você).**
Em Authentication → Sign In / Providers → Email, desligue **Confirm email** só neste projeto: o e-mail gratuito do
Supabase só envia para membros da equipe e travaria os cadastros de teste.
Em Authentication → URL Configuration, deixe por enquanto `http://localhost:3000`. O endereço da Vercel entra no passo H.

**C. Marcar o projeto (você, no SQL Editor).**
Cole `passos/00_marcar_homologacao.sql` → Run → deve aparecer `OK: projeto marcado como homologação`.

**D. Aplicar as migrations (você, no SQL Editor).**
Cole `passos/01_…` → Run → `OK: migration 0001_init aplicada`. Repita até o `05_…`, um por vez e na ordem.

**E. Verificar (você).**
Cole `verificar.sql` → Run → as 11 linhas devem mostrar `ok = true`. Envie-me um print dessa tabela.

**F. Dados de teste (você).**
Cole `dados-teste.sql` → Run → aparecem 6 organizações `[TESTE]`.

**G. Chaves no ambiente do Claude (você).**
Menu do ambiente no topo da sessão → Edit → variáveis:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VP_ENV=homolog`, `HOMOLOG_SUPABASE_REF=<id do projeto>`.
Em Network access, libere `<id do projeto>.supabase.co`.
**Nunca cole chaves no chat.** As chaves ficam em Project Settings → API. Para valer, abra uma sessão nova depois.
Na sessão nova, eu rodo `npm run homolog:verificar-api`, que só lê: confere pela internet que um visitante sem login
não vê atletas, perfis, pagamentos, relatórios nem fotos, e não executa funções internas.

**H. Vercel (eu, depois da sua confirmação das configurações).**
Projeto separado `vitrineplayer-homolog`, protegido por login. Depois adicione o endereço gerado em
Authentication → URL Configuration (Site URL e Redirect URLs).

**I. Conta de administrador (você).**
Crie a sua conta em `/pt/cadastro` → troque `SEU_EMAIL_AQUI` em `tornar-admin.sql` → Run → entre de novo: você vai direto para `/pt/admin`.

**J. Teste da jornada (você e eu).**
Com uma segunda conta, crie um atleta **fictício** → "Ir para pagamento" → `simular-pagamento.sql`
(troque `NOME_ESPORTIVO_AQUI`) → no `/pt/admin`, aprove ou peça ajustes → confira o aviso na fila e a ficha.

## Ensaio local (sem rede, sem custo)

```bash
supabase/homolog/testar-local.sh   # roda o roteiro C–J num PostgreSQL temporário, incluindo as travas
npm run test:db                    # testes de banco (isolamento, IA, admin)
```
