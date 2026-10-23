# Ficha da migração 0015 — faixa etária de 6 a 22 anos (PROPOSTA)

Situação: escrita e testada **só no banco local**. Não aplicada na homologação. Aplicar
somente com aprovação específica.

Arquivos: `db/migrations/0015_faixa_etaria.sql` · reversão `db/reversoes/0015_faixa_etaria.sql` ·
testes `db/tests/faixa_etaria.test.sql`.

> Numeração: a 0015 passa a ser esta. O plano A + B + C (sessão do app, aparelho novo, dados
> pelo servidor), ainda não autorizado, fica com o próximo número livre.

## O que muda

| # | Mudança | Tipo |
|---|---|---|
| 1 | Atleta novo, ou data de nascimento alterada, precisa ter de **6 a 22 anos** | gatilho novo |
| 2 | Idade sempre calculada pela data de hoje (`athlete_age`): as permissões mudam sozinhas no aniversário | função nova |
| 3 | Faixa de idade por organização, definida pelo admin (com motivo e auditoria), nunca abaixo do piso do tipo | colunas + funções novas |
| 4 | `athlete_visible_to_pro` passa a exigir que alguma organização aprovada do usuário cubra a idade atual | **regra existente alterada** (só fica mais restritiva) |
| 5 | Interesse, nota, avaliação e funil gravados por uma organização que não cobre a idade: recusados | gatilhos novos |
| 6 | 6 a 10 anos: sem análise por IA com notas e sem avaliação com notas de profissionais | gatilhos novos |
| 7 | Interesse com finalidade (geral, convite para avaliação, bolsa 50%, bolsa 100%, apresentação da escolinha) | coluna + funções novas |

### Pisos e padrões por tipo de organização

| Tipo | Piso (nunca abaixo) | Sem autorização do admin |
|---|---|---|
| Escolinha | 6 | 11 a 22 |
| Clube | 6 | 11 a 22 |
| Núcleo de captação | 6 | **nenhum acesso** até o admin definir a faixa |
| Olheiro | 11 | 11 a 22 |
| Empresário / agente | 15 | 15 a 22 |
| Marca / empresa | 18 | 18 a 22 (nenhum menor de idade) |

Aos 23 anos o atleta sai de todo acesso profissional; o responsável ou titular continua vendo e
editando o perfil.

### Finalidades do interesse

| Finalidade | Quem pode enviar |
|---|---|
| Geral | qualquer organização que vê o atleta |
| Convite para avaliação | escolinha, clube, núcleo |
| Bolsa de 50% / 100% / apresentação | só escolinha |

Mesmas regras de hoje: mensagem sem telefone, e-mail ou link; limite mensal; uma solicitação
aberta por atleta; o responsável decide; o contato da organização só aparece para a família
depois de aceitar; a organização nunca recebe o contato da família.

## O que NÃO muda

- Regras do responsável, do admin, do segundo fator, do login e da Data API.
- Políticas de acesso existentes (nenhuma é reescrita); só `athlete_visible_to_pro` ganha uma
  condição a mais, e por ela passam busca, ficha, fotos, interesses, notas, avaliações, listas
  e funil.
- Cadastro gratuito.

## Riscos

| Risco | Tratamento |
|---|---|
| Profissional perde acesso a atletas fora da faixa da sua organização | É o objetivo; o admin ajusta a faixa com motivo registrado |
| Núcleos de captação ficam sem acesso até o admin definir a faixa | Decisão sua; o painel do admin precisa da tela de faixas (código, depois da migração) |
| Perfis já existentes fora de 6–22 | Homologação tem 0 atletas; em outros bancos, só a troca de data é barrada |
| Desempenho: a idade é calculada por linha | Funções simples; base pequena; medir na homologação |
| Testes de navegador | Usam olheiro com atletas de 14 e 15 anos (continuam visíveis) |

## Testes (banco local, 23/10)

- `faixa_etaria.test.sql`: **47 verificações**. Inclui:
  - cadastro de 6 e 22 aceito; 5 e 23 recusados;
  - matriz completa de quem vê quem: escolinha, escolinha autorizada, clube, núcleo sem faixa,
    núcleo de 8 a 14, empresário, olheiro e marca;
  - aos 23 o atleta some para os profissionais e a família continua vendo e editando;
  - faixas: admin com motivo e auditoria; abaixo do piso recusado; profissional não altera;
  - bolsas só de escolinha; mensagem sem telefone; a família vê a finalidade;
  - membro de duas organizações não grava pela organização errada;
  - 6 a 10 anos sem avaliação com notas e sem IA; 11 anos permitido.
- Toda a bateria anterior continua passando (portal, IA, LGPD, segurança, segundo fator, login).
- Reversão: reverte 0015 e 0014 em sequência e reaplica com o banco idêntico.
- Prova extra: um banco até 0014 e um banco com 0015 + reversão ficaram **idênticos** (funções
  com permissões, tabelas, colunas, gatilhos e políticas).

## Backup e aplicação (quando autorizado)

1. Conferir a identidade do projeto e da branch (`vitrineplayer-homolog`, `main`) e os dados (0 atletas).
2. Criar a branch de backup `backup-antes-0015`.
3. Ensaio com rollback na própria homologação (transação desfeita) e conferência do catálogo.
4. Aplicar só a 0015 pelo `migrar.mjs` e rodar os testes no Neon.
5. Publicar o código que usa as novidades (tela de faixas no admin, finalidade do interesse no
   portal e na caixa da família, mensagens de erro), que só pode entrar **depois** da migração.

## Reversão

`db/reversoes/0015_faixa_etaria.sql`, numa transação: apaga gatilhos, funções e colunas novas e
devolve `athlete_visible_to_pro` à versão anterior. Perde-se a finalidade dos interesses e as
faixas definidas pelo admin; os interesses em si ficam. Depois, voltar o app ao commit anterior.
