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

## Decisões de escopo e visão do ecossistema (out/2026)

Registro para que o que existe hoje não limite o que vem depois. **Nada desta seção está implementado além do indicado como "feito".**

### Ecossistema

| Grupo | Papel | Estado |
|---|---|---|
| Atletas e responsáveis | criam e mantêm perfis completos | feito (painel do responsável) |
| Clubes, núcleos de captação, scouts | encontram talentos | futuro (busca profissional) |
| Empresários e agências | encontram atletas e, depois, parceiros | futuro |
| Peneiras / oportunidades | conectam oportunidades a atletas compatíveis | futuro |
| Marcas / patrocinadores | participam por oportunidades comerciais controladas | futuro (`pro_org_kind = 'brand'` já existe) |
| VitrinePlayer | organiza dados, controla acesso e privacidade, cria conexões | — |

Todos os grupos profissionais são `organizations` (+ `organization_members`); o tipo (`pro_org_kind`: club, scout, agent, company, scouting_hub, brand) diferencia. Novos papéis entram como novos tipos/colunas, sem tabelas paralelas.

### Terminologia

Na interface, sempre **Responsável** (nunca "Tutor"). Internamente seguem `RESPONSIBLE`, `athlete_guardians`, `guardian_relation`.

### Internacional desde o início (feito)

- País sempre ISO-3166 alfa-2 (`athletes.country`, `profiles.country`, `organizations.country`), com `check`.
- Estado/província/departamento/região e cidade em texto livre — nenhuma dependência de UF brasileira. Normalização futura (ISO-3166-2) pode entrar como coluna adicional sem quebrar.
- Formulários listam América Latina primeiro e depois todos os países; nenhum padrão fixo "BR" (o país do responsável vem do cadastro e sugere o do atleta).
- Nacionalidade principal (`nationality`), outras cidadanias (`other_citizenships`, até 3) e passaporte válido (`valid_passport`). **Nunca** número ou cópia de passaporte. "Pode atuar em outro mercado" é derivável das cidadanias (ex.: cidadania de país da UE) e vira filtro, não pergunta extra.
- Idiomas: `pt` e `es` hoje; `locales` + dicionários tipados permitem `en`, `it` etc. sem mudar a estrutura.

### Busca profissional (futuro)

Os filtros previstos já são colunas estruturadas e indexadas (0003): país, estado/cidade, nacionalidade, outras cidadanias, ano de nascimento (`birth_year`), idade/categoria, posição principal e secundárias, pé, altura, peso, clube atual, clubes anteriores (`athlete_clubs`), federação, competições, características (`traits`), disponibilidade (viagem, cidade, estado, internacional) e o que busca (`seeking`). Toda consulta profissional passa por `athlete_visible_to_pro()` (aprovado + ativo + não bloqueado). A busca geral também poderá retornar organizações aprovadas, conforme regras de exibição por tipo.

### Buscas salvas (futuro)

Tabela prevista `pro_saved_searches (id, organization_id, created_by, name, filters jsonb, notify boolean, last_run_at)`. `filters` usa as mesmas chaves das colunas acima, para que um job futuro compare atletas recém-aprovados com as buscas e enfileire avisos em `notification_outbox` (já existe). O job deve aplicar `athlete_visible_to_pro` no contexto de cada organização, para que bloqueios valham também para avisos.

### Peneiras / oportunidades (futuro)

Modelo previsto `opportunities`: organização responsável (ou VitrinePlayer), `origin` ('third_party' | 'vitrineplayer') exibido sempre na interface, país/região/cidade/local, datas e período de inscrição, anos de nascimento/categorias aceitos, posições, sexo/categoria, requisitos, descrição, link/processo de inscrição, gratuita/paga (+ valor), status (rascunho, aberta, encerrada, cancelada). Segmentação da base usa os mesmos campos estruturados do atleta. Texto padrão: nenhuma oportunidade garante avaliação, seleção ou contratação.

### Parcerias entre empresários/agentes (futuro, B2B)

Não é rede social. Previsto: anúncios privados entre organizações verificadas do tipo `agent` (mercado/país de interesse, categoria, posição, tipo de parceria, disponibilidade internacional) e solicitação privada de contato intermediada, no mesmo padrão de `contact_requests`. Depende de desenho comercial e jurídico.

### Patrocínios (futuro)

Marcas são `organizations` com `kind = 'brand'`. Participação via oportunidades comerciais controladas pela VitrinePlayer; sem acesso direto à base de atletas.

### Privacidade (feito)

O bloqueio do responsável vale para qualquer tipo de organização. Para a organização bloqueada, o atleta simplesmente não existe: não aparece em resultados, recomendações, buscas salvas, peneiras segmentadas ou contato, e nada indica o bloqueio.
