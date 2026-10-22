# db/reversoes — scripts de volta das migrations

Um arquivo por migration (mesmo nome). Nunca são aplicados automaticamente: só com
autorização, depois de um backup, quando for preciso desfazer uma migration já aplicada.
Cada script é testado localmente (aplicar → reverter → comparar com o estado anterior →
aplicar de novo) por `db/tests/local/testar-reversoes.mjs`, chamado em `npm run test:db`.
A alternativa completa é restaurar o branch de backup criado antes da migration.
