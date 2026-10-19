-- =============================================================================
-- PASSO 00 — marcar este projeto Supabase como HOMOLOGAÇÃO da VitrinePlayer
-- Rodar UMA única vez, somente no projeto novo "vitrineplayer-homolog".
--
-- O que faz:
--  * Confere que o projeto está vazio (nenhuma tabela no schema public). Se não
--    estiver, para sem alterar nada — evita aplicar no projeto errado.
--  * Cria o schema interno vp_meta com a marca "homolog". Todos os passos
--    seguintes recusam rodar em projetos sem essa marca.
--  * Cria o registro de migrations no formato do Supabase CLI
--    (supabase_migrations.schema_migrations), para que nada seja aplicado duas vezes.
-- vp_meta não é exposto pela API (só "public" e "graphql_public" são).
-- =============================================================================
do $vp$
begin
  if exists (select 1 from pg_namespace where nspname = 'vp_meta') then
    raise exception 'VITRINEPLAYER: este projeto já está marcado. Nada foi alterado.';
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public') then
    raise exception 'VITRINEPLAYER: o schema public já tem tabelas — este não é um projeto novo e exclusivo. Nada foi alterado.';
  end if;
end $vp$;

create schema vp_meta;
revoke all on schema vp_meta from public;
create table vp_meta.environment (
  name       text primary key check (name in ('homolog', 'production')),
  label      text not null,
  marked_at  timestamptz not null default now()
);
insert into vp_meta.environment (name, label) values ('homolog', 'vitrineplayer-homolog');

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version     text primary key,
  statements  text[],
  name        text
);

select 'OK: projeto marcado como homologação' as resultado;
