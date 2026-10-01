---
name: vitrineplayer-design
description: Direção visual da VitrinePlayer — futebol primeiro, tecnologia depois. Use sempre que criar, revisar ou alterar qualquer interface do projeto (Home, seções, componentes, mockups, tipografia, cores, motion, vídeo/fotografia, layout mobile) e antes de aprovar qualquer mudança visual.
---

# VitrinePlayer — direção visual

## Regra central

**A VITRINEPLAYER É FUTEBOL PRIMEIRO, TECNOLOGIA DEPOIS.**

Fotografia e vídeo são protagonistas. A interface serve ao conteúdo esportivo,
nunca o contrário. Quem abre o site precisa sentir, antes de ler: *"isso é futebol"*.

Linguagem: **campanha de marca esportiva + agência internacional de jogadores +
plataforma profissional de scouting.** Universo: futebol profissional, futebol de
base, scouting, tecnologia e oportunidade.

Referência de nível (impacto, fotografia, percepção profissional): Elenko Sports.
Nunca copiar layout exato, textos, código, identidade ou elementos proprietários.

Não pode parecer: startup genérica, SaaS, dashboard, site de apostas, site de
peneira, escolinha, portal esportivo antigo, projeto conceitual/tech abstrato.

## 0. Ordem de decisão e escopo

1. Palavras do usuário (sempre vencem). 2. Esta skill. 3. Tokens em `src/app/globals.css`.

Só frontend. Nunca alterar banco, Supabase, RLS, autenticação, cadastro, pagamento,
integrações ou regras de negócio ao aplicar esta skill.

## 1. Vídeo e fotografia (protagonistas)

- **Hero**: vídeo real de futebol de base em tela cheia (100vw × 100svh), cortes
  cinematográficos — entrada em campo, chuteira, gramado, bola, disputa, drible,
  passe, gol, goleiro, comemoração, arquibancada, concentração.
- Sobre o vídeo, só: marca (no header), headline curta e muito forte, uma linha de
  apoio e **um** CTA ("Cadastrar atleta"). Nada de explicações, cards ou números.
- A Home é uma sequência de **grandes imagens**: full bleed, atleta ocupando a tela,
  texto sobre fotografia, números gigantes sobre cenas reais.
- Toda mídia passa por `src/content/media.ts` (slots com `src` + `shot`, a descrição
  da cena). Componentes usam `MediaSlot`/`HeroReel`, nunca caminhos fixos.
- **Placeholder = liso.** Enquanto não houver mídia real, o slot mostra um tom de
  gramado à noite e a descrição da cena. **Proibido** simular futebol com CSS/SVG:
  estádio, refletores, luzes/bokeh, gramado desenhado, mira de scout, silhuetas,
  ilustrações ou animações conceituais.
- Especificação: clipes de 3–6 s, MP4 H.264, sem áudio, ≤ 2 MB (desktop) e
  ≤ 900 KB (mobile/vertical), poster por clipe; fotos JPG/AVIF ≥ 2400 px.
- Grading: contraste alto, pretos densos, verdes profundos de gramado, pele natural.
- Só mídia licenciada. Atletas menores: nada de rosto identificável sem autorização.

## 2. Cor — "noite de jogo"

| Token | Uso |
|---|---|
| `ink` #050806 | preto base (com viés verde) |
| `graphite`/`carbon` | superfícies escuras secundárias |
| `pitch` #0c2418 | verde profundo — seções de bloco (Como funciona) |
| `turf` #17432c | gramado sofisticado — preço, destaques de manifesto |
| `grass` #4f9a6a | detalhe e interação (hover, "Player" do logo) — nunca em grandes áreas |
| `bone` #f2f1eb | off-white — texto e seção de manifesto (quebra de contraste) |

- Verde associado ao **campo**: gramado molhado à noite, refletores, fotografia.
- Proibido: verde neon/limão, degradês tecnológicos verdes, brilhos, glow,
  qualquer coisa que lembre site de apostas.
- Ritmo de fundos: escuro (vídeo) → off-white (manifesto) → imagem → verde
  profundo → imagem/preto → verde gramado (preço) → preto (rodapé).

## 3. Tipografia — pôster esportivo

- Família única **Archivo** (variável). Títulos = `display`: peso 800,
  **condensado (largura 72%)**, caixa alta, `line-height` 0.82–0.88.
- Escala: hero `clamp(3.6rem, 19.5vw, 13.5rem)` no celular / `11.5vw` no desktop;
  títulos de seção `clamp(3rem, 15–17vw, 13rem)`; corpo 1–1.125rem, `leading` 1.5.
- Headlines curtas (2–4 linhas de 1–2 palavras). Poucas palavras, muito contraste.
- `line-mask` com folga vertical para acentos (Á, Ó, Ç) não serem cortados.
- Testar a linha mais longa em PT e ES a 360px.
- Evitar: rótulos em caixa alta espaçada acima de títulos, fonte mono em marketing,
  "→" em botões, strings "A · B · C" em texto corrido.

## 4. Composição

- Full bleed sempre que houver imagem. Texto ancorado embaixo, sobre gradiente só na base.
- Sem cards arredondados, caixinhas, ícones genéricos, sombras decorativas.
  Separação por imagem, cor de fundo e filetes finos.
- Perfil do atleta **integrado à direção de arte**: foto grande sangrando, nome
  gigante invadindo a coluna de dados — nunca um card no meio da página.
- Nenhum elemento de dashboard na Home (a interface do produto fica nos mockups).
- Numeração só para sequência real (Como funciona 01–03).

## 5. Motion

- Elegante e a serviço da imagem: abertura do hero (cortina + push-in + linhas
  subindo), imagens que abrem como cortina, títulos grandes que sobem da máscara,
  manifesto que acende com o scroll, números que contam sobre a cena.
- Proibido: efeitos futuristas gratuitos, partículas, glow, parallax forte,
  fade em todo parágrafo.
- Animar só `transform`, `opacity`, `clip-path`. Tudo desligado com
  `prefers-reduced-motion`. Runtime único (`MotionRuntime`), sem bibliotecas.

## 6. Mobile (a maior parte do tráfego pago)

- Desenhar primeiro para 360–390px; não pode parecer desktop reduzido.
- Vídeo ocupa praticamente a tela inteira; headline realmente grande (≈ 19vw);
  CTA de largura total, ≥ 56px de altura.
- Fotografia em largura total; carrossel com snap para sequências (Como funciona).
- Textos curtos, nada apertado; barra de CTA fixa após o hero.
- `100svh`, `safe-area`, sem rolagem horizontal da página.

## 7. Performance e acessibilidade

- Server Components por padrão; JS cliente só com estado real.
- Poster do hero com prioridade; vídeos `preload` só no clipe ativo; `next/image` com `sizes`.
- Contraste AA sobre imagem (gradiente na base garante); foco visível; alvos ≥ 44px.
- Mídia decorativa `aria-hidden`; textos via dicionários PT/ES.

## 8. Copy

- Voz de marca esportiva: frases curtas, afirmativas, vocabulário do futebol
  (craque, base, campo, jogo). Ex.: "Todo craque começou na base."
- Nunca prometer contratação, teste ou avaliação; manter o aviso no preço.

## 9. Checklist

- [ ] Primeira tela = vídeo/imagem + headline + 1 CTA.
- [ ] A página é dominada por fotografia/vídeo, não por blocos de interface.
- [ ] Nenhum placeholder ilustrado/abstrato.
- [ ] Verde de campo, sem neon/degradê tech.
- [ ] Mobile 390px e desktop 1440px sem estouro; acentos íntegros nos títulos.
- [ ] `npm run lint` e `npm run build` limpos; screenshots desktop e mobile.
