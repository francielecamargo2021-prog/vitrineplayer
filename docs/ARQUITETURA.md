# VITRINE — Arquitetura inicial (Etapa 1)

> Plataforma privada de talentos do futebol. **Atleta entra. Responsável cadastra. VITRINE organiza. Profissionais encontram.**
> Não é rede social, peneira nem marketplace público.

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Front + BFF | **Next.js 16 (App Router) + TypeScript** | SSG/SSR, Server Components (pouco JS no celular), Server Actions/Route Handlers para o backend inicial |
| Estilo | **Tailwind CSS v4** com tokens em `src/app/globals.css` | Design system em um lugar; sem biblioteca de UI pronta |
| Movimento | **CSS + 1 runtime de ~1 KB** (`MotionRuntime`) | Reveal, parallax, contadores e tilt sem framer-motion/GSAP |
| i18n | Rotas `/pt` e `/es` + dicionários tipados | ES herda a tipagem do PT: chave faltando quebra o build |
| Banco/Auth (próxima etapa) | **Supabase (Postgres + Auth + Storage)** | RLS garante permissões **no banco**; `supabase/migrations/0001_init.sql` já preparado |
| Pagamento (futuro) | Provedor com Pix + cartão (ex.: Mercado Pago/Stripe) via webhook → `payments` | Não implementado nesta etapa |
| WhatsApp (futuro) | API oficial (Cloud API) consumindo `notification_outbox` | A aplicação só enfileira; worker envia |

## Estrutura

```
src/
  app/[lang]/            páginas por idioma (home, cadastro, atleta/exemplo, profissional)
  app/robots.ts          só a home é indexável
  proxy.ts               redireciona "/" → /pt ou /es (Accept-Language)
  i18n/                  config de locales + dicionários pt/es
  components/
    brand/               logotipo provisório
    ui/                  Button, Field, SectionIndex (design system)
    motion/              MotionRuntime (reveal, contadores, parallax, tilt)
    home/                seções da Home + Header/Footer/MockShell
    athlete/             AthleteProfile, AthletePortrait (reutilizados na Home e mockups)
    mockups/             SignupMock, ProPortalMock
  domain/                tipos do atleta e matriz de papéis/permissões
  content/media.ts       slots de vídeo/fotos licenciados
  mocks/                 dados 100% fictícios
supabase/migrations/     esquema + RLS
```

## Papéis e privacidade (LGPD)

- **RESPONSIBLE** — conta principal (responsável legal). Vê/edita **apenas** os próprios atletas. Não existe tela nem política que liste outros atletas.
- **PROFESSIONAL / SCOUT** — só acessam a base depois que a **organização** é aprovada; leem apenas atletas `approved`; nunca leem `profiles` (contato). SCOUT pode registrar avaliações.
- **ADMIN** — analisa atletas e contas profissionais.
- Contato sempre **intermediado** (`contact_requests` → equipe VITRINE → responsável).
- Consentimentos versionados em `consents` (IP, user agent, revogação).
- Notas, tags, listas, avaliações e histórico de visualização são privados da organização.
- Áreas privadas com `noindex` + `robots.txt`; fotos irão para bucket **privado** com URLs assinadas.

## Fluxo do responsável (próximas etapas)

`cadastro da conta → validação e-mail/telefone → dados do atleta → materiais → consentimentos → pagamento (R$ 59,90 único) → in_review → approved/rejected → edição dos campos permitidos`

Estados: `draft → pending_payment → in_review → approved | rejected | suspended` (transições além de `draft → pending_payment` só por ADMIN/webhook, garantidas por trigger).

## Mídia

Sem vídeo/foto licenciados no repositório, o hero usa uma montagem cinematográfica em CSS/SVG.
Para usar vídeo real: coloque os clipes licenciados em `public/media/hero/` e liste-os em
`src/content/media.ts` (`hero.clips`). O `HeroReel` toca a sequência com crossfade, indicador de
capítulos, versão mobile por clipe e pausa fora da tela. Especificação no próprio arquivo.
Fotos dos blocos em tela cheia: `media.stills`.

## Painel do responsável (0002)

- Vínculo responsável ↔ atleta em `athlete_guardians` (responsável principal + outros responsáveis legais no futuro). Atleta criado só via `create_athlete()`.
- Profissional vê atleta somente se `status = approved`, `visibility = active` e nenhuma organização da qual é membro foi ocultada pelo responsável (`athlete_visible_to_pro`).
- Responsável recebe só sinais de atividade (`athlete_activity_signals`): sem contagem e sem identidade.
- Pagamento único: `draft → pending_payment` pelo responsável; `pending_payment → in_review` só por `mark_payment_paid` (webhook com service role ou admin). Não há checkout fictício.
- Fotos no bucket privado `athlete-photos` (`{athlete_id}/{arquivo}.webp`), lidas por URL assinada.

### Rodar localmente

```bash
npx supabase start            # Postgres, Auth, Storage, API (Docker); portas 553xx
npx supabase db reset         # aplica migrations + seed local ([DEV] organizações)
npx supabase test db          # testes de isolamento RLS (pgTAP)
# .env.local: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY de `npx supabase status`
```

`supabase/seed.sql` só roda localmente. Ele contém `dev_test_simulate_payment()` (DEV/TEST, executável apenas por conexão direta ao banco local) para testar o fluxo de revisão sem gateway.
