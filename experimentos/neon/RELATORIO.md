# Relatório do teste técnico — Neon + Vercel (19/10/2026)

Banco: `vitrineplayer-homolog` (Neon, São Paulo, plano gratuito). Somente dados fictícios, apagados ao fim de cada teste.

## Resultado

| Item | Resultado |
|---|---|
| 1. Login e cadastro (Neon Auth) | ✅ cadastro, e-mail repetido recusado, senha errada recusada, sessão, JWT EdDSA verificável, sair |
| 2. Migrations e regras de segurança | ✅ 0001–0005 aplicadas com 9 trocas automáticas + camada de compatibilidade |
| 3. 132 verificações + Data API real | ✅ 132/132 (pgTAP real) · ✅ 39/39 ponta a ponta pela Data API |
| 4. Fotos privadas | ✅ autorização (6 verificações) · ✅ Vercel Blob privado `vitrineplayer-homolog-fotos`: 16/16 (`testar-fotos.mjs`, 20/10/2026) |
| 5. Next.js 16 e código atual | ✅ build com Next 16.3.8/React 19.2.8, `proxy.ts`, Server Actions, Server Components · 11/11 no navegador |

## Dificuldades encontradas (todas resolvidas no teste)

1. Organização Neon gerenciada pela Vercel: projetos novos só pelo painel da Vercel.
2. Schema `auth` do Neon fechado para os papéis da aplicação → função `vp_uid()` (troca mecânica de `auth.uid()`).
3. Comportamento do Neon: o primeiro carregamento da extensão `pg_session_jwt` numa conexão apaga a identificação definida pelo servidor (`SET LOCAL request.jwt.claims`). `vp_uid()` lê o valor direto; os testes cobrem o caso.
4. Neon Auth guarda só nome e e-mail → cadastro em 2 passos (`complete_signup`, uma vez, só o próprio usuário).
5. Logo após o cadastro, a sessão nova só vale na próxima requisição → o servidor completa o cadastro pela conexão própria.
6. SDKs JavaScript ainda em beta (`@neondatabase/auth` 0.6.0-beta, `@neondatabase/neon-js` 0.8.0-beta) → fixar versões e isolar num módulo nosso.
7. O dono do banco ignora RLS (BYPASSRLS) → toda consulta do servidor em nome de um usuário passa por `asUser()` (papel `authenticated` + identificação).
8. Sem autenticação em duas etapas (MFA) no Neon Auth; e-mails saem de `auth@mail.myneon.app` ("Neon Auth").
9. Registro de foto sem regra de UPDATE (igual ao app atual): o caminho no Blob entra já na criação do registro, antes do envio do arquivo.

## Recomendação

Neon + Vercel, com Vercel Blob privado (região gru1) para as fotos. Condições antes de produção: solução de MFA para administradores, remetente de e-mail próprio, versões dos SDKs fixadas e os testes de banco rodando contra o Neon a cada mudança.
