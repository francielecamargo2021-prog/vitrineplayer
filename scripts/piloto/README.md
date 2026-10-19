# Kit do piloto técnico da análise por IA

**Nesta etapa o kit só SIMULA.** Ele não faz chamadas e não importa o cliente pago do Gemini.
A execução paga terá um script próprio, apresentado para autorização antes de existir.

## O que o piloto compara

Para cada vídeo:

- **Partida (> 20 min):** `baixa-inteira` (vídeo inteiro, resolução baixa, 1 pedido) × `alta-trechos`
  (trechos de 15 min em resolução alta + consolidação só texto).
- **Vídeo curto (≤ 20 min):** `alta` × `baixa`, com 1 pedido cada.

Em cada variante:

1. **Identificação do atleta:** status e minutos em que o número aparece legível.
2. **Conferência dos dados:** camisa, posição, pé e lado, com o que a IA viu e o resultado (*confirmado*, *divergente* ou *inconclusivo*).
   - No piloto, os dados informados são a verdade. Por isso "divergente" ou "confirmado com valor errado" contam como **erro**, e "inconclusivo" não conta.
3. **Minutagem:**
   - lances de referência do treinador encontrados com ±5 s e ±10 s;
   - minutos fora do vídeo;
   - alerta se a IA contou os minutos a partir do início do trecho e não do vídeo original.
4. **Notas:** diferença entre a nota da IA e a do treinador por fundamento (aceitável: média ≤ 1 ponto) e fundamentos que a IA não observou.
5. **Conteúdo proibido:** alerta para psicologia, potencial, carreira, comparações e medidas inventadas.
6. **Planilha de conferência:** cada minuto citado pela IA, com link direto ao lance, para o treinador marcar "confere / não confere".

## Como usar

```bash
mkdir -p scripts/piloto/gabaritos && cp scripts/piloto/gabarito.exemplo.json scripts/piloto/gabaritos/<id>.json   # gabaritos/ fica fora do git
# preencha o vídeo, a autorização (obrigatória para menores) e 10–15 lances de referência com o minuto
node scripts/piloto/simular.ts scripts/piloto/gabaritos/*.json               # pedidos exatos + custo, sem chamadas
node scripts/piloto/comparar.ts scripts/piloto/gabaritos/<id>.json <resultado.json>
node --test scripts/piloto/kit.test.ts
```

A simulação grava, em `scripts/piloto/saida/<id>/`, um arquivo JSONL por variante, no formato da Batch API.
Assim dá para revisar exatamente o que seria enviado ao Google.

## O que o Google recebe

Só o link público do YouTube e os dados de jogo:

- número e cores do uniforme, time, cor do adversário;
- posição, pé e lado;
- categoria e tipo de vídeo.

Nunca vão nome, data de nascimento, contato ou o id interno do atleta. O teste `kit.test.ts` confere isso.
