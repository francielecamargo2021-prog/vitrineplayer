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
| Banco/Auth | **Neon (Postgres + Neon Auth + Data API)** e **Vercel Blob** privado para fotos | RLS garante permissões **no banco**; migrations em `db/migrations/` aplicadas por `db/migrar.mjs` (com travas) |
| Pagamento (futuro) | Provedor com Pix + cartão (ex.: Mercado Pago/Stripe) via webhook → `payments` | Não implementado nesta etapa |
| WhatsApp (futuro) | API oficial (Cloud API) consumindo `notification_outbox` | A aplicação só enfileira; worker envia |

## Estrutura

```
src/
  app/[lang]/            páginas por idioma (home, cadastro, atleta/exemplo, profissional)
  app/robots.ts          produção: só páginas públicas; fora da produção: nada indexado
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
db/migrations/           esquema + RLS (fonte oficial)
db/tests/                testes do banco (pgTAP)
supabase/                arquivo histórico da versão Supabase (não usado pelo app)
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
- Fotos no Vercel Blob privado, entregues só por `/api/fotos/[athleteId]/[file]` depois de o banco confirmar a permissão.

### Rodar localmente

```bash
npm run test:db               # migrations + RLS num PostgreSQL local temporário (sem Docker, sem rede)
npm run test:auth             # regras do limite de tentativas de login
npm run dev                   # .env.local com as variáveis de .env.example (Neon + Blob + ADMIN_MFA_KEY)
```

Sem as variáveis, o site público funciona e as áreas autenticadas mostram "backend não configurado" — sempre por requisição, nunca gravado no build. Com `VP_ENV=homolog` ou `production`, o build recusa variáveis faltando.

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

## Avaliação técnica por IA (0004)

Triagem **preliminar** a partir de um único vídeo, para ajudar profissionais a decidir se vale assistir ao vídeo original. Não substitui a avaliação humana.

- **Fluxo:** painel do responsável → etapa *Avaliação técnica* (depois de *Vídeos*) → escolhe UM vídeo do YouTube já cadastrado, confirma tipo (melhores momentos, partida completa, treino), duração, camisa, cor do uniforme e posição, e dá o consentimento específico (`consent_kind = 'ai_video_analysis'`). Pedido criado só por `request_ai_analysis()`.
- **Liberação:** sem pagamento confirmado o pedido fica `awaiting_payment`; `mark_payment_paid` (trigger em `payments`) o coloca em `queued`. Um pedido em andamento por atleta; quantidade de avaliações = `ai_settings.included_per_athlete` + `ai_analysis_grants` (sem regra comercial fixa); limite de pedidos em 30 dias.
- **Processamento em lote:** `POST /api/ai/ciclo` (agendador, `Authorization: Bearer $CRON_SECRET`) roda `runCycle` (`src/lib/ai/pipeline.ts`): planeja itens (vídeo curto = 1 item; longo = trechos de 15 min + consolidação em texto), acompanha lotes abertos e envia um novo lote quando (a) encheu (`max_items_per_batch`), (b) o item mais antigo esperou `max_wait_hours` (padrão 6 h) ou (c) há consolidação pendente — sempre dentro do orçamento diário/mensal. Chave de cada linha do lote = id do item (`ai_analysis_jobs`) → pedido → atleta. Reserva atômica (`ai_claim_jobs`), conclusão única (`ai_complete_job`), novas tentativas até `max_attempts`, reconciliação de lote criado mas não registrado, custo real por `usageMetadata`.
- **Travas de custo:** nada é enviado sem `ai_settings.enabled = true` (padrão `false`), `AI_ANALYSIS_ENABLED=true`, `GEMINI_API_KEY` (somente servidor) e orçamento disponível.
- **Relatório:** rubrica por posição versionada (`src/lib/ai/rubric.ts`), notas 1–5 relativas à categoria, só com ≥ 2 lances citados com minuto; nota geral só com cobertura ≥ 60% e atleta identificado; melhores momentos limitam a confiança a "média"; sem identificação segura não há avaliação (`unidentified`). Guardado em `ai_video_reports` + `ai_report_scores` (uma linha por fundamento observado — base dos filtros futuros; atleta sem avaliação não perde nada na busca).
- **Publicação:** nasce não publicado; o responsável publica, retira ou exclui (`set_ai_report_published`, `delete_ai_report`, que revoga o consentimento). Profissional só lê relatório publicado, de atleta visível para ele (`athlete_visible_to_pro`) e como membro de organização esportiva aprovada (`is_sport_pro`: marcas nunca).
- **Testes sem custo:** `npm run test:ai` (pipeline com Gemini simulado) e `npm run test:db` (migrations + RLS em PostgreSQL local, sem Docker).

## Homologação e revisão pelo admin (0005)

- **Revisão:** `admin_review_athlete` e `admin_review_organization` são os únicos caminhos de decisão (aprovar, pedir ajustes ou recusar, suspender, reativar). Rejeitar e suspender exigem motivo. Cada decisão grava autor, data e auditoria e avisa o responsável pela `notification_outbox`. Só administradores humanos decidem; o service role não. O admin lê as fotos do atleta em revisão (`photos_admin_read`).
- **Painel:** `/[lang]/admin` com visão geral, fila de atletas por situação, ficha completa para revisão e organizações por situação. Quem não é admin recebe 404, e o admin que entra é levado direto para lá.
- **Homologação:** `db/migrar.mjs` aplica as migrations com travas (projeto e branch do Neon, marca do ambiente, impressão digital de cada arquivo, transação única); ver `db/README.md`. As ferramentas antigas de homologação no Supabase foram removidas.
- **Piloto da IA:** `scripts/piloto/` só simula. Monta os pedidos exatos de cada variante (partida inteira em resolução baixa × trechos em resolução alta), estima o custo e compara a resposta com o gabarito de um treinador (identificação, camisa, posição, pé, lado, minutagem, notas, conteúdo proibido).
