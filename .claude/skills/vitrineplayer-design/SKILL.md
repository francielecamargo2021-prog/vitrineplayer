---
name: vitrineplayer-design
description: Padrões de design da VitrinePlayer (futebol premium + editorial + cinematográfico + tecnológico). Use sempre que criar, revisar ou alterar qualquer interface do projeto — Home, seções, componentes, mockups, tipografia, cores, motion, vídeo/fotografia ou layout mobile — e antes de aprovar qualquer mudança visual.
---

# VitrinePlayer — padrões de design

Plataforma privada de talentos do futebol de base. A interface precisa parecer uma
**marca internacional do futebol**, nunca um template. Direção:
**futebol premium + editorial + cinematográfico + tecnológico.**

Referência de *nível* (não de forma): Elenko Sports. Nunca copiar layout, textos,
componentes, identidade ou código de nenhuma empresa.

## 0. Ordem de decisão

1. Palavras do usuário/briefing (sempre vencem).
2. Esta skill.
3. Tokens existentes em `src/app/globals.css` (`@theme`).

Escopo: só frontend. Nunca alterar banco, RLS, autenticação, pagamento ou regras de
negócio ao aplicar esta skill.

## 1. Princípio central — a imagem manda

- O futebol aparece **antes** do produto. Vídeo e fotografia são protagonistas; texto e UI
  são legenda.
- **Hero** = vídeo real de futebol de base em 100% do fundo (`100svh`). Sobre ele, no
  máximo: marca, headline, texto curto (≤ 18 palavras) e **um** CTA. Nada de cards,
  números, dashboards, selos, indicadores ou segundo CTA.
- Texto ancorado embaixo; o terço superior da imagem fica livre.
- Escurecimento só onde há texto (gradiente na base), nunca um véu sobre a imagem inteira.
- Placeholders (CSS/SVG) são temporários e **neutros**: não podem virar identidade.

## 2. Vídeo e fotografia

- Fonte única de mídia: `src/content/media.ts`. Componentes nunca hardcodam caminhos.
- Vídeo do hero: clipes de 3–6 s (entrada em campo, drible, passe, gol, defesa,
  comemoração, detalhe de chuteira/bola/gramado, concentração), MP4 H.264, sem áudio,
  ≤ 2 MB (desktop) / ≤ 900 KB (mobile), poster por clipe, `muted playsInline`,
  pausa fora da tela e com `prefers-reduced-motion` (mostra o poster).
- Grading: escuro, contraste alto, dessaturado; sem verdes saturados.
- Fotografia: atletas reais em ação ou detalhe, sangrando nas bordas (full-bleed),
  nunca em molduras com sombra. Retratos 4:5; blocos de cena 16:9 ou `100svh`.
- Nenhuma mídia externa não licenciada. Imagens com `next/image` e `sizes` corretos.
- Menores de idade: nada de rosto identificável de atleta real sem autorização registrada.

## 3. Tipografia

- Família de identidade: **Archivo** (variável, eixo de largura). O contraste vem de
  **largura e peso**, não de trocar de família:
  - display: peso 800, largura 115–125% no desktop, 100% no celular, caixa alta,
    `line-height` 0.82–0.9, tracking −0.03 a −0.045em;
  - texto: largura 100%, peso 400–500, 16–18px, `line-height` 1.5–1.65, ≤ 65 caracteres.
- Escala: hero `clamp(2.7rem, 12vw, 10rem)`; título de seção `clamp(2.2rem, 9vw, 6rem)`;
  subtítulo `clamp(1.5rem, 5.6vw, 3rem)`; texto 1–1.125rem; legenda 0.8rem.
- `text-wrap: balance` em títulos. Testar a palavra mais longa em ES e PT (ex.:
  "ENCONTRADO.", "POSIBILIDADES.") a 360px — nunca pode estourar.
- Proibido (marcas de página gerada):
  - destacar uma palavra/linha do título em itálico, serifa ou outra cor;
  - rótulo em CAIXA ALTA espaçada acima de cada título ("01 — Conceito");
  - fonte monoespaçada para microrrótulos de marketing (mono só para dados tabulares nos mockups);
  - strings com pontos médios ("A · B · C") em texto corrido; prefira frases;
  - "→" anexado a botões e links.

## 4. Cor

- Base escura e neutra: `ink`, `night`, `graphite`, `carbon`, `steel`; texto `bone`/`fog`/`ash`.
- A cor de assinatura (`--color-signal`) é **provisória**. A composição deve funcionar 100%
  em monocromático; a cor aparece só em estado de interação (hover/foco/ativo) e
  detalhes mínimos. Nunca estruturar hierarquia dependendo dela.
- Evitar os clichês: verde-gramado, preto + verde-ácido, preto + vermelhão,
  gradiente roxo-azul, creme + terracota.
- Contraste mínimo WCAG AA (4.5:1 texto, 3:1 texto grande/ícones) inclusive sobre vídeo.

## 5. Composição, hierarquia e espaçamento

- Ritmo: **imagem → manifesto → imagem → conteúdo → imagem → conversão**. Alternar
  blocos full-bleed com blocos tipográficos; nunca duas seções densas seguidas.
- Grade de 12 colunas no desktop, 1 coluna no celular; gutter 16px (mobile),
  40px (md), 64px (xl) via utilitário `gutter`.
- Espaço vertical generoso: seções `py-28` (mobile) a `py-44/48` (desktop).
- Uma ideia por tela. Um elemento memorável por seção; o resto quieto.
- Estrutura é informação: numeração só para sequência real (ex.: Como funciona 01–03).
  Listas não sequenciais não recebem números.
- **Sem kit de cards SaaS**: nada de grades de cards iguais com raio + sombra. Separe com
  espaço e filetes (`border-t`), não com caixas. Caixas só para o que é de fato um objeto
  (ex.: a interface demonstrativa da base profissional).
- Raio 0 por padrão; nada de sombras decorativas.

## 6. Motion e microinterações

- **Um momento orquestrado por tela**, não efeitos espalhados:
  - abertura do hero (cortina + push-in + linhas subindo);
  - revelação de imagem full-bleed (cortina/zoom-out);
  - texto do manifesto que acende com o scroll.
- Proibido: fade-and-slide-up em toda seção, hover em todo card, parallax forte.
- Conteúdo legível **em repouso**: nada fica invisível esperando observer.
- Curvas: `--ease-cine` (saídas), `--ease-soft` (loops). Durações 0.5–1.6s.
- Microinterações respondem à ação (hover/foco/toque mostram o que muda): CTA com
  preenchimento, linha que cresce, `:active` no mobile.
- Animar apenas `transform`, `opacity`, `clip-path`. Tudo desligado com
  `prefers-reduced-motion`.
- Motion via `MotionRuntime` (atributos `data-*`); não adicionar bibliotecas de animação.

## 7. Mobile first (tráfego pago chega pelo celular)

- Projetar primeiro em 360–390px; depois expandir.
- Primeira dobra no celular: imagem domina ≥ 50% da altura; headline legível sem zoom;
  CTA com largura total e altura ≥ 48px dentro da zona do polegar.
- Barra de CTA fixa (`StickyCta`) aparece após o hero e some em preço/rodapé.
- `100svh`, `env(safe-area-inset-*)`, sem rolagem horizontal (verificar `scrollWidth`).

## 8. Performance

- Server Components por padrão; JS cliente só onde há estado real.
- LCP: poster/primeiro frame do hero com prioridade; fontes via `next/font` (`display: swap`).
- Vídeo: `preload` só do clipe ativo; próximos com `metadata`.
- Sem bibliotecas de UI/animação externas; CSS e o runtime de ~1 KB bastam.
- Meta: LCP < 2,5s em 4G, CLS < 0,05, JS da Home < 100 KB.

## 9. Acessibilidade

- Foco visível em tudo que é clicável; ordem de tabulação lógica.
- Mídia decorativa com `aria-hidden`; vídeo sem som e sem informação essencial.
- Alvos de toque ≥ 44px; texto mínimo 14px (legendas) e 16px (corpo).
- `lang` correto por idioma (`pt-BR`/`es`); i18n via dicionários, nunca texto fixo em componente.

## 10. Texto (copy)

- Frases curtas, voz ativa, sentence case nos dicionários (caixa alta só via estilo display).
- CTA diz exatamente o que acontece: "Cadastrar atleta".
- Nunca prometer contratação, teste ou avaliação. Manter o aviso de não-garantia no preço.

## 11. Checklist antes de entregar

- [ ] Hero: só marca, headline, texto curto e 1 CTA sobre a imagem.
- [ ] Nenhum dos proibidos das seções 3, 5 e 6 presente.
- [ ] Funciona em monocromático (cor de assinatura removível).
- [ ] 390px e 1440px sem estouro; `scrollWidth` = largura da viewport.
- [ ] Reduced motion ok; foco visível; contraste AA.
- [ ] `npm run lint` e `npm run build` limpos.
- [ ] Screenshots: hero desktop/mobile e seções principais.
