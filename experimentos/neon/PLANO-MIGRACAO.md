# VitrinePlayer — Plano da migração completa para Neon + Vercel

*19/10/2026 · para aprovação.*

**Andamento (21/10/2026):** Etapas 1, 2, 3 e 4 e o portal dos profissionais concluídos na homologação. Etapa 3: painel e admin lendo dados pela Neon Data API com o JWT do usuário; IA com conexão de serviço própria; migration `0007` (perfil gratuito, modalidade, objetivos novos, 20 vídeos, maioridade do "próprio atleta"). Etapa 4: fotos no Vercel Blob privado com permissão no Neon (envio, visualização, substituição, ordem, foto principal, exclusão; limite de 12), servidas só por `/api/fotos/…` com a permissão conferida a cada exibição; o servidor recodifica para WebP e remove GPS/EXIF. Landing atualizada para cadastro gratuito; formulários não perdem mais o que foi digitado quando há erro. Testes: 195 de banco, 48 de login, 34 do painel e 25 de fotos no navegador, 39 de isolamento, 16 de fotos (experimento), 20 travas, 18 IA, 13 piloto. Portal: migration `0008` (profissional só recebe cartão/ficha sem contato; cadastro e verificação; busca, favoritos, listas; interesse decidido pela família), 93 testes pgTAP e 47 no navegador. Funcionalidades (PLANO-FUNCIONALIDADES, fases A, B1, B2, C1–C5, D1): migrations 0009–0012 — avaliação e acompanhamento pelos profissionais, equipe por convite, admin completo, segundo fator obrigatório para admin, exclusão e exportação de dados (LGPD), console da IA (desligada). Preparação para homologação, etapa 1 (só código, nada publicado): build sem "backend não configurado" gravado e com trava de variáveis; limite de tentativas de login, códigos e cadastro no banco (migration `0013`, **ainda não aplicada no Neon**); cabeçalhos de segurança; nada indexado fora da produção; estrutura preliminar de Privacidade, Termos e Contato; ferramentas antigas do Supabase removidas. Pontos de restauração: `backup-antes-recriar-2026-10-20`, `backup-antes-0007-2026-10-20` `backup-antes-0008-2026-10-20` e `backup-antes-0009-2026-10-21`.

## 0. Situação atual

| Item | Situação |
|---|---|
| Banco Neon `vitrineplayer-homolog` (São Paulo, gratuito) | Pronto. Migrations adaptadas aplicadas, 132/132 verificações, banco limpo |
| Login (Neon Auth) e Data API | Validados de ponta a ponta (39/39) e no navegador com Next.js 16 (11/11) |
| Autorização das fotos | Validada no banco real (6 verificações) |
| Armazenamento das fotos (Vercel Blob) | **Bloqueado:** a conexão da Vercel não tem permissão de escrita na equipe (403). O teste `testar-fotos.mjs` está pronto: 16 verificações de envio, acesso, bloqueio e exclusão |

**Para desbloquear o Blob (você, ~3 min, sem custo adicional):**
1. Vercel → Storage → Create → **Blob**.
2. Nome `vitrineplayer-homolog-fotos`, acesso **Private**, região **São Paulo (gru1)**.
3. **Não conecte a nenhum projeto.**
4. Na página do armazenamento, copie o valor de `BLOB_READ_WRITE_TOKEN`.
5. Cadastre esse valor nas configurações do ambiente do Claude (menu do ambiente → Edit → variável `BLOB_READ_WRITE_TOKEN`) e abra uma sessão nova. **Nunca cole no chat.**

## 1. Arquitetura final

```
Navegador ──► Vercel (Next.js 16, funções em São Paulo/gru1)
                 │  Server Components / Server Actions / rotas
                 ├─► Neon Auth (login, sessão em cookie HttpOnly, JWT de 15 min)
                 ├─► Neon Data API (com o JWT do usuário → RLS)          ← dados do usuário
                 ├─► Postgres direto (servidor) via asUser()/serviço      ← cadastro, admin, IA, fotos
                 ├─► Vercel Blob privado (gru1)                            ← arquivos das fotos
                 └─► Gemini (Batch API, só servidor, desligado até o piloto)
```

- **Todos os dados no Brasil** (Neon sa-east-1, Blob gru1, funções gru1), exceto o Gemini (EUA) e o provedor de e-mail. Isso entra na política de privacidade.
- **Acesso aos dados pelo servidor:** a Data API é chamada só pelo servidor, com a biblioteca `@supabase/postgrest-js`.
  - É estável, de código aberto, e usa a mesma sintaxe `.from()`/`.rpc()` de hoje, o que reduz a reescrita.
  - Evita o SDK `neon-js`, ainda em beta.
  - O navegador nunca fala direto com o banco.
- **SDK de login:** `@neondatabase/auth` com versão **fixa** (0.6.0-beta), isolado em `src/lib/auth/`. Trocar de versão ou de fornecedor mexe só nesse módulo.
- **Quem é quem continua no nosso banco:** `profiles.role` decide se a pessoa é responsável, profissional ou admin. O papel do Neon Auth não é usado.

## 2. Etapas

| # | Etapa | Conteúdo | Dias |
|---|---|---|---|
| 1 | Banco | Pasta `db/` com as migrations Neon definitivas: as 9 trocas aplicadas na fonte, camada de compatibilidade e `complete_signup`. Script de migração com travas (marca de ambiente, ordem, sem repetição). Testes locais imitando o Neon e testes no Neon a cada mudança | 1,5 |
| 2 | Login | Cadastro em 2 passos, entrar, sair, **recuperação de senha** (nova), **verificação de e-mail por código** ligada, `proxy.ts` (idioma + proteção de `/painel` e `/admin`), troca de idioma preservada | 1,5 |
| 3 | Dados | Substituir o cliente Supabase (77 consultas, 18 funções): Data API com o JWT; `asUser()` para o servidor; processamento da IA com conexão própria; tipos do banco gerados | 1,5 |
| 4 | Fotos | Envio com autorização prévia no banco e token de upload de curta duração; rota `/api/fotos/...` que confere a RLS antes de ler o arquivo; exclusão do arquivo junto com o registro; nunca há URL pública | 1 |
| 5 | **MFA dos administradores** | Ver seção 3 | 1,5 |
| 6 | **E-mails** | Ver seção 4 | 0,5–1 |
| 7 | Segurança dos menores | Ver seção 5 (a maior parte é verificação e configuração) | 1 |
| 8 | **Publicar a homologação** | Ver seção 6 | 0,5 |
| 9 | Testes completos | Jornadas de responsável, profissional e admin; celular e desktop; revisão de segurança | 1 |
| | **Total** | | **~10–11 dias úteis** |

A pasta `supabase/` sai do projeto ao fim da etapa 3 e continua no histórico do git. A IA continua desligada, e o piloto pago segue esperando a sua autorização separada.

## 3. Autenticação em duas etapas para administradores (obrigatória antes da produção)

O Neon Auth ainda não tem MFA. A proposta é fazer **nós mesmos o código de 6 dígitos de aplicativo (TOTP)**, só para contas ADMIN:
- **Cadastro do segundo fator:** QR code para Google Authenticator, Authy ou 1Password, mais 10 códigos de recuperação de uso único.
- **Segredo guardado com segurança:** fica no banco **criptografado**, com uma chave que existe só no servidor.
- **Cada acesso a `/admin`** exige a sessão do Neon Auth **e** um cookie de segundo fator assinado, válido por 8 h e preso àquela sessão.
- **Proteção também no banco:** as funções de admin só funcionam quando o servidor declara "segundo fator verificado". Mesmo uma senha de admin vazada não aprova nada sem o código.
- **Contra tentativas:** limite de 5 erros, depois espera; tudo vai para a auditoria.
- **Quando o Neon lançar MFA nativo,** avaliamos trocar.
- Responsáveis e profissionais não precisam disso no lançamento. É opcional no futuro.

## 4. E-mails

| Tipo | Hoje | Proposta |
|---|---|---|
| Login (verificação, recuperação de senha) | Saem de `auth@mail.myneon.app` como "Neon Auth" | Provedor próprio configurado no Neon Auth, saindo de `nao-responda@<seu domínio>` com a marca VitrinePlayer |
| Avisos (aprovação, ajustes, relatório pronto) | Ficam numa fila, sem envio | Rotina que lê a fila e envia pelo mesmo provedor |

- **Recomendação:** Resend (plano gratuito com 3.000 e-mails/mês; a confirmar). Precisa do domínio com SPF, DKIM e DMARC configurados.
- **Atenção:** no plano Hobby da Vercel, rotinas agendadas rodam **1 vez por dia**. Para avisos mais rápidos é preciso o Pro, ou disparar o envio na hora da ação.

## 5. Segurança e privacidade dos menores

1. **Regras de acesso no banco (RLS):** as 132 verificações mais as de fotos e Data API rodam no Neon a cada mudança.
2. **Data API sem acesso anônimo** e com chamadas permitidas só a partir do servidor.
3. **O dono do banco ignora as regras de acesso**, então toda consulta feita em nome de um usuário passa por `asUser()`. Um teste automático impede código novo de usar a conexão do dono sem isso.
4. **A falha do Neon que apaga a identificação** na primeira conexão tem teste próprio e fica documentada.
5. **Fotos:** só privadas, sempre servidas pela rota que confere permissões, com cache privado e sem dados de localização (o navegador já converte para WebP).
6. **Ambientes separados:** homologação e produção com projetos, bancos, chaves e armazenamentos diferentes. Produção nunca é copiada para homologação.
7. **Cópias de segurança:**
   - homologação no plano gratuito, com 6 h de histórico;
   - **produção no Neon Launch, com 7 dias de restauração** (pago por uso).
8. **Exclusão de conta** apaga perfil, atletas, relatórios **e os arquivos de foto**. A auditoria guarda o registro sem dados pessoais.
9. **Barreiras contra abuso:** limite de tentativas de login (Better Auth) mais regras do firewall da Vercel; cabeçalhos de segurança (CSP, proibição de iframe); páginas fora do Google (noindex).
10. **Contratos e LGPD:** verificar os acordos de tratamento de dados do Neon e da Vercel e atualizar a política de privacidade (Brasil + Gemini nos EUA + e-mail).
11. **Lançamento:** nenhum lançamento sem o MFA da seção 3.

## 6. Publicação da homologação na Vercel

| Item | Configuração proposta |
|---|---|
| Projeto | `vitrineplayer-homolog`, separado da futura produção |
| Código | Repositório `vitrineplayer`, branch publicado **só** `claude/amazing-mayer-2bnsp0` |
| Proteção | **All Deployments + login da Vercel** (sem custo) |
| Região das funções | São Paulo (gru1) |
| Variáveis | `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `DATABASE_URL` (com pool de conexões), `NEON_DATA_API_URL`, `BLOB_READ_WRITE_TOKEN`, `VP_ENV=homolog`, `AI_ANALYSIS_ENABLED=false`. **Sem chave do Gemini.** |
| Neon Auth | Endereço `.vercel.app` da homologação cadastrado como domínio confiável |
| Blob | `vitrineplayer-homolog-fotos` conectado **só** a esse projeto, quando você autorizar |

- **Quem cria:** a conexão da Vercel recusa escrita (403). Ou você reautoriza a conexão para a equipe, ou cria o projeto pelo painel com estes valores.
- **Plano Hobby:** é para uso **não comercial**. A homologação pode começar nele, mas a produção exige o Pro (US$ 20/mês).

## 7. Custos

| Ambiente | Mensal |
|---|---|
| Homologação | **US$ 0** (Neon Free, Blob dentro do gratuito ou do crédito, Vercel) |
| Produção (1–5 mil atletas) | **~US$ 31–65**: Vercel Pro US$ 20, Neon Launch US$ 10–40, Blob US$ 1–5, e-mail US$ 0 no plano gratuito |

Gemini à parte, conforme o piloto.

## 8. Decisões para aprovar

| # | Decisão | Recomendação |
|---|---|---|
| 1 | Acesso aos dados | Data API pelo servidor com `@supabase/postgrest-js` (estável) + `asUser()` |
| 2 | MFA dos admins | TOTP próprio com códigos de recuperação e trava também no banco |
| 3 | Provedor de e-mail e domínio | Resend + domínio da VitrinePlayer (qual?) |
| 4 | **Recriar o schema do banco de homologação** para aplicar a versão definitiva do zero (só dados fictícios; hoje vazio) | Autorizar |
| 5 | Plano da Vercel | Hobby na homologação; Pro antes da produção |
| 6 | Criação de recursos na Vercel | Reautorizar a conexão para a equipe, **ou** você cria pelo painel |
| 7 | Remover `supabase/` depois da etapa 3 | Sim (fica no histórico) |

## 9. Nova direção de produto (20/10/2026) — proposta de sequência

**Já valendo (Etapa 3):** cadastro e publicação gratuitos (envio direto para a revisão do admin), modalidade campo/futsal, objetivos clube / empresário / avaliação / escolinha / núcleo de captação, até 12 fotos e 20 vídeos garantidos no banco, maior de 18 pode administrar o próprio perfil e menor sempre tem responsável legal.

**Já existe no banco e só falta tela:** bloqueio por organização (aplicado na RLS), favoritos e listas privadas da organização (`pro_favorites`, `pro_lists`), pedidos de contato (`contact_requests`), sinais de atividade sem identidade e verificação de organizações pelo admin.

| Ordem | Etapa proposta | O que muda no banco | Depende de |
|---|---|---|---|
| 4 | Fotos (já no plano) | nada novo | — |
| P1 | **Portal profissional básico:** cadastro do profissional, organização pendente → aprovada pelo admin, busca com filtros (posição, categoria, modalidade, país), ficha do atleta para profissionais (sem contato) | tipo de organização `school` (escolinha); papel da conta escolhido no cadastro | 4 |
| P2 | **Interesse e contato mediado:** profissional demonstra interesse com uma mensagem curta; o responsável vê a organização (nome e tipo), aceita ou recusa; ao aceitar, a VitrinePlayer entrega o contato **do responsável** só àquela organização. Sem chat aberto com menores | política de leitura de `contact_requests` para o responsável, função `respond_contact_request`, registro do aceite, avisos na `notification_outbox`, limite de pedidos por organização | P1 + E-mails (6) |
| P3 | **Listas privadas e acompanhamento** (favoritos, listas, notas internas da organização) | nada novo (tabelas e RLS prontas); revisar RLS de leitura das listas | P1 |
| — | Modalidades VIP / recursos avançados | campo de plano na organização, sem cobrança | decisão comercial futura |

**Pendências de segurança encontradas na Etapa 3** (entram na Etapa 7):
- Exclusão de conta: `audit_log.actor_id`, `athletes.reviewed_by` e `athlete_org_blocks.created_by` impedem apagar o perfil. Proposta: anonimizar (`set null`) mantendo o registro.
- Limite de tentativas de login (o Neon Auth não bloqueia senha errada repetida).
- Formulários do painel são limpos após um erro (React 19); preservar o que foi digitado.

**Decisão pendente sobre a landing:** a seção de preço e o botão fixo ainda dizem "R$ 59,90, pagamento único", em conflito com o cadastro gratuito. A landing não foi alterada (regra do projeto); o texto precisa da sua aprovação.
