# VitrinePlayer — Plano para completar as funcionalidades antes da publicação

Status (21/10/2026): **fases A, B1, B2, C1–C5 e D1 implementadas na homologação** (decisões 1–8 aprovadas).
Migrations 0009–0012; testes: 416 pgTAP no Neon, 62 no navegador (`db/tests/testar-funcionalidades.mjs`) além das suítes anteriores.
**D2–D4 (piloto real da IA, cobrança e filtros por nota) aguardam nova autorização.** A IA real continua desligada.
Base: Etapas 1–4 e portal dos profissionais concluídos (migrations 0000–0008).

Complexidade: **P** = pequena (1 migration curta ou 1–2 telas) · **M** = média (migration + 3–6 telas + testes)
· **G** = grande (vários fluxos, segurança sensível ou integração externa).

---

## 1. Avaliação e acompanhamento pelos profissionais

### Já existe
| Item | Onde | Situação |
|---|---|---|
| Favoritos (por pessoa) | `pro_favorites`, aba Favoritos | pronto |
| Listas privadas da organização | `pro_lists`, `pro_list_items`, aba Listas | pronto |
| Histórico de interesses da organização | `pro_my_interests()`, aba Interesses | pronto (lista geral) |
| Notas privadas da organização | tabela `pro_notes` (texto + etiquetas) com política por organização | **só banco, sem tela** |
| Avaliação técnica | tabela `scout_evaluations` (técnico, tático, físico, mental, potencial 0–10 + observação) | **só banco, sem tela** |
| Rubrica de fundamentos por posição | `src/lib/ai/rubric.ts` (22 fundamentos, 7 grupos de posição, escala 1–5 relativa à categoria) | pronta (usada pela IA) |
| Registro de visualizações | `athlete_views` | pronto |

### Problemas encontrados
1. **Ninguém consegue gravar avaliação:** a política exige o papel `SCOUT`, mas o cadastro profissional cria `PROFESSIONAL`.
2. **A escala antiga mede "mental" e "potencial" (0–10)** — subjetivo para menores e diferente da rubrica da IA.
3. **Notas e avaliações continuam legíveis depois que a família bloqueia a organização** (a política só olha a organização).

### Proposta
- **Notas privadas na ficha:** escrever, etiquetar ("rever vídeo", "observar ao vivo"…), ver autor e data, apagar as próprias. Só a organização vê; família e atleta nunca.
- **Avaliação técnica pela mesma rubrica da IA:** fundamentos da posição do atleta, nota 1–5 relativa à categoria, observação e referência opcional a um vídeo e minuto. Sem "mental" e "potencial". Histórico de avaliações da organização por atleta.
- **Acompanhamento (funil):** etapa por atleta na organização — Observando → Avaliado → Interesse enviado → Em conversa → Arquivado — com filtro e contagem.
- **Novidades:** marca "atualizado" quando o atleta ganhou vídeo, foto ou dados novos desde a última visita da organização.
- **Histórico por atleta:** na ficha, linha do tempo da organização (visualizações, avaliações, notas, interesse e resposta).
- **Equipe da organização:** o dono convida colegas por e-mail; listas, notas e avaliações passam a ser compartilhadas de verdade. Admin pode remover membros.
- **Privacidade:** tudo continua só da organização; se a família bloquear ou pausar o perfil, notas e avaliações ficam ocultas (não apagadas) enquanto o atleta não estiver visível; tudo some se o atleta for excluído (já em cascata).

Dependências: Fase A (ajustes de banco). Complexidade: **M** (notas, avaliação, funil, histórico) + **M** (equipe/convites).

---

## 2. Painel administrativo

### Já funciona
| Área | O que faz |
|---|---|
| Início | contadores de atletas em revisão/aprovados e organizações pendentes/aprovadas |
| Atletas | fila por situação, ficha completa, aprovar, recusar, suspender, reativar (com motivo e auditoria) |
| Organizações | verificação (documento, licença, responsável, contato, site), aprovar/recusar/suspender com motivo, denúncias das famílias, limites do portal |
| Banco | auditoria (`audit_log`) de todas as decisões; políticas `*_admin` em todas as tabelas |

### Falta construir
| Área | Proposta | Compl. |
|---|---|---|
| Navegação e busca | menu fixo do admin; busca por nome, e-mail, documento | P |
| Atletas | filtros (país, categoria, posição, visibilidade), responsáveis vinculados, histórico de decisões, moderação de foto/vídeo (remover conteúdo impróprio, com aviso à família) | M |
| Responsáveis | lista, detalhe (atletas, consentimentos, atividade), suspender conta | M |
| Organizações por tipo | abas clube / empresário / agente / olheiro / escolinha / núcleo; detalhe com membros, listas (só contagem), interesses enviados, denúncias e histórico; reverificação | M |
| Denúncias | fila própria com situação (aberta / em análise / resolvida), decisão registrada (arquivar, advertir, suspender organização) | M |
| Interesses | visão geral com filtros e números (enviados, aceitos, recusados, expirados) e cancelamento de um interesse abusivo | P |
| Configurações | limites do portal (pronto) + IA (liga/desliga, modelo, orçamento) + versão dos termos | P |
| Avisos | fila de e-mails pendentes (`notification_outbox`) para quando houver provedor | P |
| Auditoria | consulta da auditoria por pessoa, atleta ou organização | P |
| **Segundo fator para admin (TOTP)** | já planejado em PLANO-MIGRACAO §3 — **obrigatório antes da publicação** | M–G |
| LGPD | exclusão de conta e exportação de dados a pedido (depende das regras de exclusão, pendência da Etapa 7) | G |

Dependências: Fase A para denúncias com situação; segundo fator antes da publicação. Complexidade total: **G** (dividida em C1–C5).

---

## 3. Análises técnicas por IA

### Estrutura existente (migration 0004 + `src/lib/ai`)
- **Modelos por posição:** 22 fundamentos e 7 grupos (goleiro, zagueiro, lateral, volante, meio, ponta, atacante) com pesos; escala 1–5 relativa à categoria; nota só com ≥ 2 lances citados com minuto; nota geral só com cobertura ≥ 60%. Versão `rubric-2026.10-v1`.
- **Envio:** o responsável escolhe um vídeo do YouTube já cadastrado, informa número e cor da camisa, posição e trecho, e dá um consentimento específico. Um pedido ativo por atleta, até 3 por 30 dias.
- **Processamento:** Gemini Batch API (50% do preço), vídeos longos divididos em trechos de 15 min e consolidados; orçamento diário e mensal; tentativas; custo real registrado.
- **Três travas contra custo:** `ai_settings.enabled = false` no banco, `AI_ANALYSIS_ENABLED` no ambiente e chave da API. Hoje **tudo desligado**.
- **Relatório:** nasce não publicado; só a família publica, despublica ou exclui (excluir revoga o consentimento). "Não identificado" e "falhou" não consomem a análise.
- **Para profissionais:** relatório publicado legível por organizações esportivas aprovadas (marcas não) e notas por fundamento (`ai_report_scores`) prontas para filtros.
- **Piloto:** kit que só simula (gera exatamente o que seria enviado, sem chamadas) e compara com o gabarito de um treinador. O Google recebe só o link do YouTube e dados de jogo — nunca nome, data de nascimento ou contato.
- **Testes:** 18 do pipeline + 49 pgTAP + 13 do piloto.

### Problemas encontrados
1. **A fila depende do pagamento antigo do cadastro:** o pedido só entra em `queued` se houver um pagamento `paid` em `payments` (modelo R$ 59,90, que acabou). Com o cadastro gratuito, todo pedido ficaria parado em "aguardando pagamento".
2. **Texto desatualizado** na tela da família: "a análise começa assim que o pagamento do cadastro…".
3. **O portal não mostra o relatório publicado** ao profissional (a política existe, a ficha não usa).
4. **Leitura direta da tabela de relatórios pelo profissional** (inclui modelo e ids internos): para seguir a regra da 0008, passar a entregar por função.
5. **Não há tela de admin para a IA** (configuração, fila, custos, cortesias, falhas).

### Custo estimado por análise (tabela de preços do projeto, sem chamar a API)
| Vídeo | Até 12/2026 (promocional) | A partir de 01/2027 |
|---|---|---|
| Melhores momentos, 5 min | US$ 0,09 | US$ 0,18 |
| Treino, 20 min | US$ 0,23 | US$ 0,47 |
| Jogo completo, 90 min | US$ 0,76 | US$ 1,52 |

### Possibilidades de cobrança (só desenho; nada será implementado sem aprovação)
- **Base pronta:** `ai_analysis_grants` (créditos por atleta) + `included_per_athlete` (análises incluídas, hoje 1).
- **Modelo sugerido:** análise avulsa por crédito comprado; pagamento confirmado → crédito → pedido entra na fila. "Não identificado" ou falha devolvem o crédito (já é assim).
- **Futuro:** pacotes de créditos; plano VIP para organizações (limites maiores, filtros por nota da IA) — depois do lançamento.
- **Depende de decisão:** provedor de pagamento (ex.: Mercado Pago para Pix/cartão no Brasil; outro para países de língua espanhola), preço, nota fiscal, regras de reembolso. **Não contratar nada agora.**

Dependências: Fase A (desatar a fila do pagamento antigo) → console do admin → piloto real (exige autorização: chave paga do Google e vídeos autorizados) → cobrança. Complexidade: **M** (console + portal) e **G** (cobrança, quando autorizada).

---

## 4. Fases e prioridades

| Fase | Conteúdo | Depende de | Compl. | Prioridade |
|---|---|---|---|---|
| **A. Ajustes de banco (0009)** | fila da IA por crédito (sem pagamento antigo), avaliação para qualquer profissional aprovado, notas/avaliações ocultas com bloqueio, relatório da IA ao profissional por função, situação das denúncias | — | P | 1 |
| **C1. Admin: base** | menu, busca, responsáveis, atletas com filtros e moderação de mídia | A | M | 2 |
| **C2. Admin: organizações e denúncias** | abas por tipo, detalhe com membros e histórico, fila de denúncias com decisão | A | M | 2 |
| **B1. Profissional: notas, avaliação, funil, histórico, novidades** | telas na ficha e nova aba "Acompanhamento" | A | M | 3 |
| **D1. IA: console do admin + relatório no portal** | configuração, fila, custos, cortesias, falhas; relatório publicado na ficha do profissional; texto da família corrigido | A | M | 4 |
| **C3. Admin: interesses, configurações, avisos, auditoria** | visões e filtros | C1 | P | 4 |
| **B2. Equipe da organização (convites)** | convite por e-mail exige provedor de e-mail; sem ele, convite por link de uso único | B1 | M | 5 |
| **C4. Segundo fator para admin** | TOTP + códigos de recuperação + trava no banco | — | M–G | **obrigatória antes da publicação** |
| **D2. Piloto real da IA** | 5–10 vídeos com autorização, comparação com treinador; custo estimado abaixo de US$ 10 | D1 + **autorização** | P | antes de vender |
| **C5. LGPD: exclusão e exportação** | depende das regras de exclusão (Etapa 7) | C1 | G | antes da publicação |
| **D3. Cobrança por análise** | créditos pagos via provedor | D2 + **autorização** | G | depois do piloto |
| **D4. Filtros por nota da IA no portal** | usar `ai_report_scores` | D2 | M | depois do piloto |

Ordem recomendada: **A → C1 → C2 → B1 → D1 → C3 → C4 → B2 → C5**; D2–D4 só com autorização.
Cada fase: migration com testes pgTAP, testes no navegador, ponto de restauração no Neon antes de mudar o banco.

## 5. Decisões para aprovar

1. **Avaliação técnica:** usar os fundamentos da posição da rubrica da IA (1–5, relativo à categoria) e **retirar "mental" e "potencial"**? *Recomendo: sim.*
2. **Bloqueio ou pausa:** notas e avaliações da organização ficam **ocultas** enquanto o atleta não estiver visível? *Recomendo: sim (não apagar).*
3. **Etapas do acompanhamento:** Observando, Avaliado, Interesse enviado, Em conversa, Arquivado? *Recomendo: sim.*
4. **Equipe da organização:** permitir convidar colegas (limite inicial de 5 membros)? *Recomendo: sim, na fase B2.*
5. **Admin e dados do atleta:** o admin **não edita** os dados do atleta; pode remover foto/vídeo impróprio (avisando a família), suspender e pedir correção. *Recomendo: sim.*
6. **Análises de IA incluídas no cadastro gratuito:** manter 1 gratuita por atleta ou começar com 0 até o piloto? *Recomendo: 0 até o piloto validar a qualidade; depois decidir.*
7. **Piloto real da IA:** quando autorizado, usar uma chave paga do Google com orçamento máximo (ex.: US$ 10). *Autorização separada.*
8. **Cobrança:** escolha do provedor, preço e reembolso ficam para depois do piloto. *Nada será contratado agora.*
