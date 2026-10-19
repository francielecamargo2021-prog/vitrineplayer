-- =============================================================================
-- Camada de compatibilidade Neon — aplicada ANTES das migrations 0001–0005.
-- Recria, no Neon, as poucas peças que o Supabase fornecia pronto:
--  * storage.buckets / storage.objects / storage.foldername(): registro das fotos.
--    Os arquivos ficam no Vercel Blob privado; esta tabela guarda o caminho de cada
--    foto e aplica as MESMAS regras de acesso das migrations (0002 e 0005). A rota
--    de fotos da aplicação só entrega um link temporário se o banco liberar a linha.
--  * public.request_role(): papel da requisição (o Supabase tinha auth.role()).
--  * Permissões padrão iguais às do Supabase (a RLS decide o que cada um vê).
-- auth.uid() já existe no Neon (pg_session_jwt) e lê o mesmo request.jwt.claims.
-- =============================================================================

create schema if not exists storage;

-- auth.uid() existe no Neon, mas o schema auth pertence à plataforma e os papéis
-- authenticated/anonymous não têm acesso a ele (concessão ignorada). vp_uid() lê o
-- mesmo valor com a permissão do dono do banco.
create or replace function public.vp_uid() returns uuid
  language sql stable security definer set search_path = '' as $$
  -- Lê o "sub" das claims da requisição (definidas pelo servidor ou pela Data API).
  -- Não chama auth.uid()/auth.user_id(): observado no Neon, o primeiro carregamento da
  -- extensão pg_session_jwt numa conexão apaga um request.jwt.claims definido com SET LOCAL.
  select (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub')::uuid
$$;
grant execute on function public.vp_uid() to anonymous, authenticated;

create or replace function public.request_role() returns text
  language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role'
$$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets (id),
  name text not null,
  owner_id text default public.vp_uid()::text,
  blob_url text,                         -- endereço privado no Vercel Blob (nunca enviado ao navegador)
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;

create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

grant usage on schema storage to anonymous, authenticated;
grant select, insert, update, delete on storage.objects to anonymous, authenticated;
grant select on storage.buckets to anonymous, authenticated;
grant execute on function storage.foldername(text) to anonymous, authenticated;

-- Supabase concede tabelas a anon/authenticated e deixa a RLS filtrar; aqui, o mesmo.
alter default privileges in schema public grant select, insert, update, delete on tables to anonymous, authenticated;
alter default privileges in schema public grant usage, select on sequences to anonymous, authenticated;
