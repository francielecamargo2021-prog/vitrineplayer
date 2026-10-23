# Demonstração VitrinePlayer — 23/10/2026, 10h

Roteiro e plano de dados. Nada aqui foi executado na homologação: a criação dos dados e a
análise real dependem de autorizações próprias (ver "O que falta").

## Regras da demonstração

- Só contas e atleta de demonstração, com e-mails `vp-demo-…@example.com` e nomes marcados
  com **[DEMO]**. Nenhum dado de família real.
- O vídeo do atleta exige autorização de quem aparece. Se for menor: autorização do
  responsável e nome de exibição em vez do nome real.
- O relatório gerado antes da apresentação aparece com a data e o modelo usados. Se a análise
  ao vivo não for feita, isso é dito em voz alta: "relatório gerado hoje cedo com o mesmo fluxo".
- Nenhuma proteção é desligada: aprovação do admin, consentimento, créditos, travas de custo
  e regras do banco continuam valendo.
- Partida completa é apresentada como **experimental**.

## Plano de dados de demonstração (homologação, depois de autorizado)

| Item | Como é criado | Observação |
|---|---|---|
| Responsável [DEMO] | cadastro pela tela, com código de e-mail | e-mail `vp-demo-familia@example.com` |
| Atleta [DEMO] | painel do responsável, enviado para revisão | posição, categoria, camisa e cor iguais às do vídeo |
| Vídeo | link **público** do YouTube, melhores momentos, até 10 min | escolhido e autorizado pela responsável do projeto |
| Admin [DEMO] | conta criada pela tela; papel ADMIN definido no banco (como nos testes); segundo fator configurado | o código do segundo fator vem do aplicativo autenticador de quem apresenta |
| Organização profissional [DEMO] | cadastro profissional pela tela, aprovada pelo admin | conta `vp-demo-clube@example.com` |
| Pedido de análise | responsável pede na tela, com consentimento; usa a análise incluída no cadastro | o banco confere consentimento e crédito |
| Análise real | admin → IA → "Processar agora" | uma chamada; custo máximo previsto US$ 0,37 (10 min) ou US$ 0,22 (4 min) |
| Remoção | script que apaga só o que tem `vp-demo-` / [DEMO], com contagem antes e depois | depois da apresentação, com autorização |

## Roteiro (cerca de 12 minutos)

1. **Abertura (1 min).** Página inicial: o problema das famílias e dos clubes.
2. **Família cadastra o atleta (2 min).** Painel do responsável [DEMO]: dados, fotos, vídeo
   do YouTube, consentimentos. Envia para revisão. Mostrar que nada aparece para clubes ainda.
3. **Admin revisa e aprova (2 min).** Admin entra com senha + segundo fator. Ficha do atleta,
   aprovação registrada na auditoria.
4. **Análise por IA (3 min).**
   - Família pede a análise (texto de consentimento na tela).
   - Admin → IA: travas, orçamento, botão "Processar agora" com o custo máximo.
   - Ao vivo só se o ensaio das 8h tiver dado certo; senão, abrir o relatório gerado cedo.
5. **Relatório (2 min).** Identificação pela camisa, trecho analisado, avaliação técnica e
   tática, notas com justificativa e minutos dos lances, "não confirmado" quando falta lance,
   pontos fortes, a desenvolver, parecer. A família decide publicar.
6. **Profissional (1 min).** Clube [DEMO] aprovado vê o perfil e o relatório publicado.
7. **Scout Premium (1 min).** `/pt/profissional/scout-premium`: prévia, itens "Planejado",
   sem preço, sem cobrança.

## Plano B (sem internet ou sem ambiente publicado)

Gravação e capturas do mesmo fluxo, feitas na noite anterior a partir do app ligado à
homologação, mais a página de exemplo `/pt/atleta/exemplo` (dados fictícios, marcada como tal).

## O que falta para a análise real

1. Senha do Neon trocada e segredo `VP_HOMOLOG_DB_URL` cadastrado (sessão nova).
2. Chave **paga** da API do Google no segredo `GEMINI_API_KEY` (o plano gratuito usa os vídeos
   para melhorar produtos: proibido aqui).
3. Autorização para criar os dados [DEMO] na homologação.
4. Autorização para ligar a IA só na homologação: `ai_settings.enabled = true` (dado no banco),
   `AI_ANALYSIS_ENABLED=true` no servidor local e orçamento diário de pelo menos US$ 0,50.
5. Autorização da chamada paga: modelo `gemini-3.8-flash`, preço oficial de US$ 0,75 por milhão
   de tokens de entrada e US$ 3,75 de saída (válido até 31/12/2026), sem desconto de lote.
   Custo máximo (vídeo inteiro + teto de 32 mil tokens de saída): US$ 0,37 para 10 min,
   US$ 0,22 para 4 min. Custo esperado: cerca de US$ 0,31 (10 min) ou US$ 0,16 (4 min).
6. Link público do YouTube (até 10 min) com camisa, cor e posição do atleta.
