-- =============================================================================
-- Imitação mínima do Neon para testes locais (PostgreSQL puro, sem Docker).
-- NÃO é usada no Neon. Reproduz só o que as migrations e os testes usam:
--  * papéis authenticated / anonymous (Data API) e o dono neondb_owner,
--    que, como no Neon, NÃO é superusuário mas ignora a RLS (BYPASSRLS);
--  * schema neon_auth (dono: papel neon_auth) com a tabela "user" igual à do Neon;
--  * extensão pgcrypto no schema public (como no Neon);
--  * neon.project_id / neon.branch_id, que as travas do migrar.mjs conferem.
-- O schema auth do Neon não é imitado de propósito: a aplicação não pode depender dele.
-- Rodado como superusuário, uma vez, num banco recém-criado.
-- =============================================================================
create role authenticated nologin;
create role anonymous nologin;
create role neon_auth nologin;
create role neondb_owner login bypassrls;
grant authenticated, anonymous, neon_auth to neondb_owner;

create extension if not exists pgcrypto with schema public;

create schema neon_auth authorization neon_auth;
create table neon_auth."user" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null,
  image text,
  "createdAt" timestamptz not null default current_timestamp,
  "updatedAt" timestamptz not null default current_timestamp,
  role text,
  banned boolean,
  "banReason" text,
  "banExpires" timestamptz
);
alter table neon_auth."user" owner to neon_auth;

-- O schema public pertence ao dono do banco (pg_database_owner), como no Neon.
grant usage on schema public to authenticated, anonymous;
