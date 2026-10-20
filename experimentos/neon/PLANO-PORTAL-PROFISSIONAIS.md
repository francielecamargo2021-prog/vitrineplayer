# VitrinePlayer — Plano do portal dos profissionais (proposta, NÃO implementado)

Status: aguardando aprovação (20/10/2026). Nada deste documento foi executado.

Público: clubes, empresários (agentes), escolinhas, núcleos de captação e olheiros,
sempre **verificados pela equipe VitrinePlayer** antes de ver qualquer atleta.

## 1. O que já existe e será reaproveitado

| Já existe | Onde |
|---|---|
| Organizações com tipo (`club`, `agent`, `scout`, `scouting_hub`, `company`, `brand`) e situação de revisão | `organizations`, `organization_members` (0001) |
| Aprovação de organizações pelo admin | `admin_review_organization` (0005), tela `/admin/organizacoes` |
| Regra central de visibilidade: profissional aprovado + atleta aprovado + perfil ativo + organização não bloqueada | `athlete_visible_to_pro()` (0002) |
| Bloqueio por organização feito pela família | `athlete_org_blocks` (0002) |
| Fotos só para quem o banco autoriza (já testado na Etapa 4) | RLS de `storage.objects` + `/api/fotos/…` |
| Favoritos (por pessoa), listas e notas (por organização) | `pro_favorites`, `pro_lists`, `pro_list_items`, `pro_notes` |
| Pedido de contato intermediado | `contact_requests` (status `requested → forwarded → accepted/declined/expired`) |
| Registro de visualizações e sinais para a família | `athlete_views`, `athlete_activity_signals()` |
| Tela demonstrativa do portal (dados fictícios) | `/[lang]/profissional` (`ProPortalMock`) — serve de base visual |

## 2. Problemas encontrados que precisam ser corrigidos ANTES de abrir o portal

1. **Profissional enxergaria colunas internas do atleta.** A política `athletes_pro_select`
   libera a LINHA inteira de `athletes`; pela Data API um profissional leria também
   `review_note` (nota interna do admin), `responsible_id`, `reviewed_by`, data de nascimento
   completa e cidade. Hoje não há profissionais cadastrados, então o risco não está ativo.
   **Correção proposta:** remover `athletes_pro_select` (e as leituras diretas `media_pro`,
   `achievements_pro`, `clubs_pro`) e entregar ao profissional só funções do banco
   (`security definer`) que devolvem um "cartão" e uma "ficha" com colunas escolhidas.
2. **Não existe o tipo "escolinha"** em `pro_org_kind` → adicionar `school`.
3. **A família não vê nem responde os pedidos de contato**: falta política de leitura e a
   função `respond_contact_request`.
4. **Não há cadastro de profissional**: hoje o papel é trocado à mão no banco.

## 3. Regras de privacidade (valem para todas as fases)

- Só profissionais de organização **aprovada** veem atletas; atleta só aparece se
  aprovado, com perfil ativo e sem bloqueio para aquela organização (já garantido no banco).
- Atletas e famílias **nunca** veem outros atletas (já é assim).
- **Nenhum dado de contato** de menor ou responsável (e-mail, WhatsApp, nome do responsável)
  chega ao profissional. Para menor de idade, o contato é sempre intermediado.
- Profissional vê **idade/ano de nascimento**, nunca a data completa; vê **estado/país**,
  não a cidade (proposta, ver decisão 5).
- Não há mensagens livres com menores. O profissional manifesta interesse com uma mensagem
  curta (até 500 caracteres, revisável pelo admin) e a **família decide**.
- Limites contra coleta em massa: X fichas abertas por dia por profissional e Y pedidos de
  interesse por mês por organização (valores na decisão 6). Toda abertura de ficha é registrada.
- Tudo aplicado no banco (RLS/funções), não só na tela; testes pgTAP e de navegador para cada regra.

## 4. Fases propostas

**P1 — Banco (migration `0008_portal_profissionais`)**
- `alter type pro_org_kind add value 'school'`.
- Remover leituras diretas do profissional (item 2.1) e criar:
  - `pro_search_athletes(filtros, página)` → cartões: nome esportivo (ou primeiro nome),
    idade, sexo, modalidade, posições, pé, altura, estado/país, clube atual, categoria,
    disponibilidade, objetivos, foto principal, se tem vídeo. Ordenação e paginação no banco.
    Registra "apareceu na busca" (sinal já previsto para a família).
  - `pro_athlete_profile(id)` → ficha completa sem contato; registra a visualização e aplica o limite diário.
- `contact_requests`: leitura para a família (`is_my_athlete`), leitura para a organização
  que pediu, `respond_contact_request(id, aceitar/recusar)` só para o responsável, prazo de
  expiração (ex.: 30 dias), um pedido aberto por organização e atleta, limite mensal.
- Cadastro de profissional: `request_organization(nome, tipo, país, documento, site)` cria a
  organização como `pending` e o vínculo do dono; `join` só por convite do dono (fase posterior).
- Índices para os filtros. Auditoria das decisões.

**P2 — Cadastro e verificação do profissional**
- `/[lang]/profissional/cadastro`: conta (mesmo Neon Auth), dados da organização, termos
  específicos (uso ético, proibição de contato direto com menores).
- Admin aprova/recusa na tela que já existe; até a aprovação o profissional só vê "em análise".

**P3 — Busca e ficha**
- `/[lang]/profissional` (troca o mock pela versão real, mesmo visual):
  filtros de modalidade, posição, idade/ano, sexo, pé, altura, país/estado, disponibilidade
  (viajar, mudar de cidade/estado/país), objetivo, com vídeo/sem vídeo.
- Ficha do atleta com fotos (via `/api/fotos`), vídeos do YouTube, trajetória e conquistas.

**P4 — Favoritos, listas e notas**
- Favoritar na busca e na ficha; listas da organização; notas internas da organização
  (nunca visíveis à família). Tudo já tem tabela e política.

**P5 — Interesse e decisão da família**
- Botão "Demonstrar interesse" com mensagem curta.
- Painel da família: caixa "Interesses recebidos" com organização (nome, tipo, país,
  verificada), mensagem e botões Aceitar / Recusar.
- Ao aceitar: ver decisão 2. Ao recusar: a organização só vê "não aceito", sem motivo.
- Notificação: dentro do painel até haver provedor de e-mail (decisão 3 do plano de migração).

**P6 — Testes e revisão de privacidade**
- pgTAP: cada regra acima (inclusive "profissional não lê `review_note`", bloqueio, pausa,
  limites, família responde só os próprios pedidos).
- Navegador: cadastro do profissional → aprovação → busca → favorito → interesse → família aceita/recusa.

Ordem: P1 → P2 → P3 → P4 → P5 → P6 (os testes de cada fase entram junto com ela).
Sem custos novos: usa Neon, Neon Auth, Vercel Blob e Data API já configurados.

## 5. Decisões para aprovar

1. **Quem pode entrar:** só organizações (um olheiro autônomo vira organização do tipo
   `scout` com um membro)? *Recomendo: sim.*
2. **O que acontece quando a família aceita:** *Recomendo:* a família recebe o contato
   oficial da organização e decide se e como falar; a organização recebe só "interesse
   aceito — a família entrará em contato". Para atleta maior que administra o próprio
   perfil, a mesma regra no início (pode ser revista depois).
3. **Verificação:** documentos pedidos por tipo (ex.: CNPJ para clube/escolinha, licença
   de agente para empresário) e revisão manual pelo admin. *Recomendo: sim, sem serviço externo.*
4. **Nome mostrado ao profissional para menores:** nome esportivo/primeiro nome + idade
   (sem sobrenome), ou nome completo? *Recomendo: nome esportivo/primeiro nome.*
5. **Localização para o profissional:** estado e país (sem cidade)? *Recomendo: sim.*
6. **Limites:** sugestão inicial de 100 fichas por dia por profissional e 30 interesses por
   mês por organização (ajustáveis; base para o plano VIP futuro, sem cobrança agora).
7. **Mensagem do interesse:** passar por revisão do admin antes de chegar à família, ou
   chegar direto com filtro de palavras e possibilidade de denúncia? *Recomendo: direto,
   com denúncia e revisão posterior, para não atrasar a família.*
