# Credencial do banco de homologação: exposição, prevenção e rotação

Registro de 22/10/2026. A senha não aparece neste arquivo, nem em nenhum arquivo do repositório.

## O que aconteceu

A senha do papel `neondb_owner` (branch `main` do projeto `vitrineplayer-homolog`) apareceu
na saída de ferramentas desta sessão por dois caminhos:

1. **A ferramenta do Neon que entrega o endereço de conexão** (`get_connection_string`) devolve o
   endereço COMPLETO, com a senha, como resposta. Cada vez que foi usada para preparar os testes
   contra a homologação, a senha ficou registrada na conversa.
2. **Um arquivo de ambiente montado sem aspas**: o endereço tem `&` (`...?channel_binding=require&sslmode=require`).
   Ao carregar o arquivo no shell, o `&` virou "rodar em segundo plano", e o shell imprimiu a
   linha inteira (`[1]+ Done DATABASE_URL=...`).

Verificado (só nomes de arquivos, sem imprimir valores):
- **Não está** em nenhum arquivo do repositório, no histórico do git, nos arquivos do build, nem
  nos arquivos temporários (que foram destruídos com `shred`).
- **Está** no registro desta conversa (o histórico da sessão). Esse registro não pode ser
  limpo daqui. **Por isso a única correção completa é trocar a senha.**
- As 6 branches de backup não têm computação ativa: a senha antiga não dá acesso a elas
  enquanto nenhuma computação for criada nelas.

## Como impedir novas exposições (já em vigor no código)

- **O assistente não usa mais** as ferramentas do Neon que devolvem segredos
  (`get_connection_string`, `reset_postgres_role_password`, `create_credential`). Consultas de
  conferência usam `run_sql`, que não devolve credenciais.
- **O endereço do banco para testes vem de um segredo do ambiente**, cadastrado pela
  responsável nas configurações do ambiente (variável `VP_HOMOLOG_DB_URL`), nunca colado na
  conversa. `scripts/preparar-homolog.mjs` monta os arquivos de teste a partir dele **sem
  imprimir nada**, com permissão só do dono, valores entre aspas (o `&` deixa de ser problema)
  e recusa qualquer banco que não seja o da homologação.
- **`npm run check:secrets`** (`scripts/verificar-segredos.mjs`) procura endereços com senha,
  senhas do Neon, tokens do Blob, do GitHub, chaves de API e chaves privadas em todos os
  arquivos que iriam para o repositório. Mostra só arquivo, linha e tipo, nunca o valor. Rodar
  antes de cada commit.
- Nada de `echo`, `set -x` ou impressão de variáveis de ambiente nos comandos de teste.

## Procedimento de rotação (NÃO executado; depende de autorização)

**Antes**
1. Confirmar onde a senha é usada hoje:
   - Vercel → projeto da VitrinePlayer → Settings → Environment Variables → `DATABASE_URL`
     (Preview e/ou Production). Não foi possível conferir daqui: o conector da Vercel não tem
     acesso ao time.
   - Segredo do ambiente de testes (`VP_HOMOLOG_DB_URL`), se já tiver sido criado.
   - Mais nenhum lugar: o Neon Auth e a Data API usam papéis próprios, administrados pelo Neon
     (`authenticator`), que **não** devem ser mexidos.
2. Escolher um momento sem testes rodando. A homologação não tem usuários reais.

**Troca (feita pela responsável no painel do Neon, não pelo assistente)**
3. Console do Neon → projeto `vitrineplayer-homolog` → Branches → `main` → Roles →
   `neondb_owner` → **Reset password**. Não usar a ferramenta do assistente para isso: ela
   mostraria a senha nova na conversa.
4. Na janela "Connect" do Neon, copiar o endereço novo **direto** para os destinos, sem colar
   na conversa:
   - Vercel: `DATABASE_URL` como variável "Sensitive", nos ambientes em que existir;
   - ambiente de testes: segredo `VP_HOMOLOG_DB_URL`.
5. Na Vercel, a variável nova só vale depois de uma nova publicação; publicar continua
   dependendo de aprovação própria.

**Conferência**
6. O assistente confere que o banco responde (`run_sql`, sem credencial) e que os testes
   conectam usando o segredo novo (`scripts/preparar-homolog.mjs`), sem exibir valores.
7. Opcional: reiniciar a computação da `main` para encerrar conexões abertas com a senha
   antiga (exige autorização; causa alguns segundos de indisponibilidade).

**Se algo der errado**
- A senha antiga não volta, e não precisa voltar: basta colocar o endereço novo no lugar
  certo. O app em homologação fica sem banco só até a variável ser corrigida.
- Se uma branch de backup ganhar computação no futuro, ela ainda terá a senha antiga: trocar
  também nela antes de usá-la.

**Depois (recomendação)**
- Criar um papel próprio para o app, com menos poderes que o dono do banco, para a senha usada
  pelo app não ser a do dono. Isso é uma mudança no Neon e exige aprovação própria.
