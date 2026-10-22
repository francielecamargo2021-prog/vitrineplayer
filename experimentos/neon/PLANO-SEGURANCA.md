# Plano de segurança antes da homologação (registro oficial)

Decisões da responsável pelo projeto em 22/10/2026. Cada etapa só começa com aprovação
explícita; cada migração tem aprovação própria, com ficha (o que muda, riscos, backup,
reversão) apresentada antes. Nenhuma etapa pode ser pulada.

## Regras definidas

### Login e cadastro
- Direção aprovada: sem limites fixos por IP, para não barrar famílias em redes
  compartilhadas (clubes, escolinhas).
- **Os limites atuais (0013) continuam ativos até as novas proteções serem comprovadas.**
  Retirá-los exige aprovação específica, depois da validação.
- Novas proteções a validar: BotID Basic (Vercel), entrada com código por e-mail
  (Neon Auth), desafio por conta.
- Trocar de aparelho não pode contornar a segurança de uma conta.
- Limitação conhecida: chamadas diretas ao Neon Auth não passam pelo app; as proteções
  do app não as cobrem.

### Segundo fator dos administradores
- Código de ativação de uso único, validade curta, guardado só em hash.
- A troca do fator nunca pode ser feita só com a senha.

### Moderação integral (regra fundamental)
- Nenhum atleta aparece na área profissional antes da primeira aprovação administrativa.
- A moderação analisa todo o perfil: dados cadastrais e esportivos, foto principal e demais
  fotos, biografia e descrições, clube, posição, características, conquistas, links de
  vídeo e qualquer informação que exponha contato pessoal.
- Nada novo aparece automaticamente: fotos, vídeos, textos e alterações esperam aprovação.
- Arquitetura aprovada: **cópia publicada separada dos dados em edição**. A última versão
  aprovada fica visível enquanto a nova aguarda análise; a pendente nunca aparece.
- O admin compara as alterações e aprova ou rejeita. Se houver edição durante a análise,
  a aprovação não pode publicar dados diferentes dos revisados.
- Ocultação, exclusão e revogação de consentimento têm efeito imediato.
- Tudo garantido no backend e no banco, não só na interface.

### Backups do Neon
- Não excluir `backup-antes-recriar-2026-10-20`.
- Nenhuma branch pode ser apagada sem justificativa apresentada e confirmação específica.
- Nunca excluir o banco principal nem backups necessários para recuperação.

### Neon Auth
- Investigação técnica autorizada; perguntas redigidas para a responsável encaminhar,
  sem informações sensíveis do projeto.
- Qualquer alteração de configuração externa depende de aprovação específica.

## Etapas

| Etapa | Conteúdo | Migração | Situação |
|---|---|---|---|
| E1 | Tratamento seguro de falhas do limitador | — | **Concluída** (22/10) |
| E2 | Novas proteções de login em paralelo aos limites atuais: contagem atômica, proteção por conta com desafio "entrar com código", aparelho reconhecido no banco, espera entre envios | 0014 | **Aplicada na homologação** (22/10), depois do backup `backup-antes-0014` e de ensaio com rollback; testes no Neon aprovados |
| E3 | BotID Basic nas ações de autenticação; política de senhas; cadastro sem revelar conta existente | — | Pendente |
| E3b | Validação na homologação publicada e, só então, retirada dos limites por IP | — | Pendente (exige aprovação própria) |
| E4 | Código de ativação e troca segura do segundo fator | 0015 | Pendente |
| E5 | Retirar permissões do papel anônimo e de PUBLIC | 0016 | Pendente |
| E6 | Consentimento do responsável por atleta, gravado e revogável | 0017 | Pendente |
| E7 | Estruturas da moderação: tabelas publicadas, estados das mídias, versão do perfil, aprovação, diferenças, filtro de contatos (sem mudar o que o profissional vê) | 0018 | Pendente |
| E8 | Virada: portal, fotos e vídeos leem só a cópia publicada; painel com alterações pendentes | 0019 | Pendente |
| E9 | Neon Auth: perguntas à comunidade e propostas de ajuste (cada uma com aprovação) | — | Perguntas redigidas |

## E1 — o que mudou

- `src/lib/auth/limits.ts`: `classifyFailure` separa falhas de configuração (recusa),
  passageiras (libera com registro) e desconhecidas (libera só no login). Em ambiente
  publicado, falta de IP é erro de configuração. Registros sem e-mail, IP ou mensagem do
  erro. Registros pós-tentativa em paralelo.
- `src/lib/auth/rate-limit.ts`: espera máxima de 2,5 s por consulta; IP exato para os
  registros de consentimento.
- `src/lib/db/index.ts`: `asService` aceita tempo máximo.
- `src/lib/auth/actions.ts`: recusa por indisponibilidade mostra mensagem própria; IP dos
  consentimentos só quando é um endereço válido.
- Dicionários: mensagem `unavailable` em português e espanhol.

## Perguntas para a comunidade/suporte do Neon (sem dados do projeto)

1. Neon Auth rate limits: which limits apply to `/sign-in/email`, `/sign-up/email`,
   `/email-otp/send-verification-otp`, `/email-otp/verify-email` and
   `/email-otp/reset-password`? Per IP, per account, or both? Are they configurable?
2. When a Next.js server calls Neon Auth through `@neondatabase/auth` (server-side), which
   IP does Neon Auth use for rate limiting — the server's egress IP or the end user's IP?
   Is there a supported way to forward the real client IP (e.g. a trusted header)?
3. Is there a way to restrict who can call the Neon Auth endpoint directly (allowed origins
   for non-browser requests, IP allowlist, or disabling public sign-up/sign-in while keeping
   server-side calls)?
4. Can Better Auth's captcha plugin (Turnstile, hCaptcha or Vercel BotID) be enabled on
   Neon Auth? If not, is bot protection planned?
5. Does a password reset (email OTP) revoke the user's other active sessions?
6. Email OTP: what are the code lifetime, maximum verification attempts per code and
   resend limits? Is passwordless sign-in with email OTP (`type: "sign-in"`) enabled by
   default when email/password is enabled?
7. What do you recommend to protect against credential stuffing without blocking many
   legitimate users who share one network (schools, sports clubs, carrier-grade NAT)?

## E2 — o que mudou (só código e testes locais; nada aplicado no Neon)

- `db/migrations/0014_protecao_conta.sql`: `auth_limit_consume`/`auth_limit_refund` (contagem
  atômica, tudo ou nada, linhas travadas em ordem fixa), `auth_account_guard` + funções
  (proteção por conta), `auth_devices` + funções (aparelhos: só hash, 90 dias, até 10,
  revogáveis), `auth_send_cooldown` (espera progressiva por e-mail). Só o servidor executa.
- `db/reversoes/0014_protecao_conta.sql`: script de volta (testado: reverter e reaplicar
  deixa o banco idêntico).
- `src/lib/auth/limits.ts`, `signin-flow.ts` (novo), `limit-sql.ts` (novo), `rate-limit.ts`,
  `actions.ts`, `account-actions.ts`, `src/lib/admin/actions.ts`, `AuthForms.tsx`, dicionários.
- Os limites de 0013 continuam ativos (agora contados sem corrida). Retirada: só na E3b.

### Riscos pendentes registrados
- **Acesso direto ao Neon Auth: NÃO resolvido.** Quem chamar o endereço do Neon Auth fora do
  app não passa pela contagem, pela proteção por conta nem pelos aparelhos. Depende do Neon.
- Login por código: o kit atual (@neondatabase/auth 0.6.0-beta) chama `sign-in/email-otp`
  corretamente; falta confirmar na homologação que o Neon Auth aceita o tipo "sign-in" e como
  trata e-mail sem conta (se cria conta ao entrar por código).
- Com os limites atuais, 10 erros por e-mail em 1 h ainda bloqueiam aparelhos novos por 1 h
  (comportamento de 0013, mantido até a E3b).
- Ordem de publicação: a 0014 precisa estar aplicada ANTES do código novo rodar; sem ela, o
  login fica indisponível de propósito (erro de configuração → recusa, ver E1).

## E2 — aplicação na homologação (22/10)

- Backup `backup-antes-0014` (br-little-frog-b6cwk0jn), pronto antes da aplicação.
- Ensaio com rollback: nenhuma política, função, tabela, gatilho ou dado existente alterado;
  tabelas e funções novas fechadas a `authenticated`, `anonymous` e Data API.
- Testes no Neon: 499 verificações de banco; 50 pedidos simultâneos (11 checagens); navegador:
  login 67, painel 34, portal 48, fotos 26, funcionalidades 62.
- **Login por código funciona no Neon Auth** (kit 0.6.0-beta, rota `sign-in/email-otp`).
- **E-mail sem conta:** a resposta é igual à de uma conta real; o Neon Auth gera o código e,
  se alguém com acesso àquela caixa digitar o código, **cria a conta**, que cai em
  "concluir cadastro" (sem painel sem consentimentos). Registrado como ponto de decisão.
- Achado corrigido: a espera entre envios passou a ser por e-mail **e tipo** de código.
