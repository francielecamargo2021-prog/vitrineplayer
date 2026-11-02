# db/ — banco VitrinePlayer (Neon)

Migrations definitivas para o Neon e as ferramentas para aplicá-las e testá-las.
É uma ferramenta de linha de comando, separada do app Next.js. A pasta `supabase/`
é só arquivo histórico (fonte original de 0001–0005) e não é usada aqui nem pelo app.

| Caminho | O que é |
|---|---|
| `migrations/0000_neon_base.sql` | Peças que o Supabase fornecia: `vp_uid()`, `request_role()`, registro das fotos (`storage.*`), permissões padrão |
| `migrations/0001`–`0005` | Migrations do app escritas para o Neon (`vp_uid()`, `neon_auth."user"`, papel `anonymous`) |
| `migrations/0006_cadastro_neon.sql` | Cadastro em 2 passos: `complete_signup()` |
| `migrar.mjs` | Aplica as migrations com travas (abaixo) |
| `conexao.mjs` | Conexão com conferência do projeto Neon e do branch |
| `tests/*.test.sql` | Testes pgTAP: isolamento (RLS), IA, revisão do admin e segurança |
| `tests/testar-neon.mjs` | Roda os testes no Neon (transações desfeitas, nenhum dado fica) |
| `tests/testar-travas.mjs` | Testa as travas do `migrar.mjs`. **Termina com "recriar": nunca usar no banco principal** (o próprio script recusa o branch principal da homologação) |
| `tests/local/` | Postgres local que imita o Neon (`run.sh`) |

## Uso

```bash
cd db && npm install

# testes locais (sem rede, sem tocar no Neon)
npm run test:local

# no Neon: o endereço fica num ARQUIVO fora do repositório (nunca na linha de comando)
export VP_ENV=homolog VP_DB_URL_FILE=/caminho/fora/do/repo/url
node migrar.mjs verificar                                   # só mostra o estado
node migrar.mjs aplicar --branch=<id-do-branch>             # aplica as pendentes
node migrar.mjs recriar --branch=<id> --confirmar-recriar=<id>   # só com o banco SEM DADOS
node tests/testar-neon.mjs
```

## Travas do `migrar.mjs`

- **Banco certo:** o banco precisa informar `neon.project_id` igual ao do ambiente (`homolog` = `rough-mode-32600282`). O ambiente `local` só aceita endereço local. Produção ainda não é aceita.
- **Branch conferido:** todo comando que altera algo exige `--branch=<id>` igual ao branch conectado.
- **Marca do ambiente:** `vp_meta.environment` precisa ser igual a `VP_ENV`.
- **Ordem:** arquivos `NNNN_nome.sql` em sequência, sem buraco nem número repetido.
- **Sem repetição nem alteração:** cada arquivo aplicado fica em `vp_meta.migrations` com seu SHA-256. Nada é reaplicado, e um arquivo alterado depois de aplicado é recusado. Mudança nova = arquivo novo.
- **Tudo ou nada:** uma única transação, com trava contra execução simultânea.
- **Recriar:** exige confirmação repetindo o branch e recusa se houver qualquer dado: usuários do Neon Auth ou linhas em tabelas da aplicação. Só não contam as configurações criadas pelas migrations (`storage.buckets`, `ai_settings`). Não toca em `neon_auth` nem nas extensões.

## Integração PitchVision (0016)

| Comando | O que prova |
|---|---|
| `npm run test:db` | migrations + RLS, inclusive `pitchvision.test.sql` (vídeo como arquivo, Gemini bloqueado para menores, regra de 6 a 10 anos, operações só do serviço, relatório sem notas) |
| `npm run test:pitchvision` | assinatura dos avisos, relatório a partir de uma saída REAL da PitchVision (vídeo sintético), ciclo do integrador, envio em partes com retomada |
| `npm run test:pitchvision:e2e` | ponta a ponta local: Postgres local com todas as migrations + PitchVision local real (API + worker). Exige `PV_REPO`, `PV_PYTHON` e `E2E_VIDEO`; `E2E_VIDEO_KIND=synthetic|real` e `E2E_DETECTOR=colorblob|rfdetr-medium` |

Os testes com vídeo **sintético** provam o fluxo técnico. Os testes com **partida real** provam que o fluxo funciona
com vídeo de verdade. **Nenhum dos dois mede a precisão da análise**: isso exige gabarito (ex.: SoccerTrack) e é
avaliado à parte, na PitchVision.
