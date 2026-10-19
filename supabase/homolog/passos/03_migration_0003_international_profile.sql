-- =============================================================================
-- PASSO 03 — migration 0003_international_profile
-- Gerado por scripts/homolog/gerar-passos.sh a partir de supabase/migrations/0003_international_profile.sql.
-- NÃO EDITAR À MÃO. Colar inteiro no SQL Editor do projeto vitrineplayer-homolog e clicar em Run.
-- É uma única transação: se qualquer linha falhar, nada é gravado.
-- =============================================================================
do $vp$
begin
  if not exists (select 1 from pg_namespace where nspname = 'vp_meta') then
    raise exception 'VITRINEPLAYER: projeto não marcado como homologação (rode o passo 00). Nada foi alterado.';
  end if;
  if not exists (select 1 from vp_meta.environment where name = 'homolog') then
    raise exception 'VITRINEPLAYER: este projeto não é o de homologação. Nada foi alterado.';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '0003') then
    raise exception 'VITRINEPLAYER: migration 0003_international_profile já aplicada. Nada foi alterado.';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '0002') then
    raise exception 'VITRINEPLAYER: aplique antes a migration 0002. Nada foi alterado.';
  end if;
end $vp$;

-- ---------------------------------------------------------------- início da migration original
-- =============================================================================
-- VITRINEPLAYER — base internacional (América Latina primeiro, depois Europa e
-- outros mercados). País sempre ISO-3166 alfa-2; estado/província/departamento
-- e cidade em texto livre (nenhuma dependência de UF brasileira).
-- Nacionalidade e cidadanias estruturadas para filtros profissionais futuros.
-- Nunca armazenar número ou cópia de passaporte.
-- =============================================================================

-- Nacionalidade: texto livre (0001) → país ISO principal + outras cidadanias.
alter table athletes drop column nationality;
alter table athletes
  add column nationality         char(2) check (nationality ~ '^[A-Z]{2}$'),
  add column other_citizenships  char(2)[] not null default '{}',
  add column valid_passport      boolean,
  add constraint athletes_country_iso check (country ~ '^[A-Z]{2}$'),
  add constraint athletes_citizenships_iso check (array_to_string(other_citizenships, '') ~ '^([A-Z]{2})*$'),
  add constraint athletes_citizenships_max check (cardinality(other_citizenships) <= 3);

alter table profiles alter column country drop default, alter column country drop not null,
  add constraint profiles_country_iso check (country ~ '^[A-Z]{2}$');
alter table organizations add constraint organizations_country_iso check (country ~ '^[A-Z]{2}$');

-- Índices para a busca profissional futura (filtros combináveis).
create index athletes_geo_idx on athletes (country, state, city);
create index athletes_birth_year_idx on athletes (birth_year);
create index athletes_nationality_idx on athletes (nationality);
create index athletes_citizenships_gin on athletes using gin (other_citizenships);
create index athletes_secondary_gin on athletes using gin (secondary_positions);
create index athletes_traits_gin on athletes using gin (traits);
create index athletes_seeking_gin on athletes using gin (seeking);
create index organizations_country_kind_idx on organizations (country, kind) where status = 'approved';

-- Cadastro: país de residência do responsável vindo do formulário (ISO), sem padrão fixo.
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'); v_kind text; v_country text := upper(coalesce(v_meta->>'country', ''));
begin
  insert into profiles (id, role, full_name, email, whatsapp, phone, country, locale)
  values (new.id, 'RESPONSIBLE', coalesce(v_meta->>'full_name', ''), new.email,
          v_meta->>'whatsapp', v_meta->>'whatsapp',
          case when v_country ~ '^[A-Z]{2}$' then v_country end,
          coalesce(v_meta->>'locale', 'pt-BR'));
  for v_kind in select jsonb_array_elements_text(coalesce(v_meta->'consents', '[]')) loop
    if v_kind in ('terms', 'privacy', 'guardian_declaration', 'no_guarantee') then
      insert into consents (profile_id, kind, version, ip, user_agent)
      values (new.id, v_kind::consent_kind, coalesce(v_meta->>'consent_version', 'unversioned'),
              case when v_meta->>'consent_ip' ~ '^[0-9A-Fa-f:.]{3,45}$' then (v_meta->>'consent_ip')::inet end,
              left(v_meta->>'consent_ua', 300));
    end if;
  end loop;
  return new;
end $$;

-- ---------------------------------------------------------------- fim da migration original
insert into supabase_migrations.schema_migrations (version, name) values ('0003', 'international_profile');
select 'OK: migration 0003_international_profile aplicada' as resultado;
