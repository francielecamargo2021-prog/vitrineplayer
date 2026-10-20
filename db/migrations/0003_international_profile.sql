-- [Neon] Versão definitiva de supabase/migrations/0003_international_profile.sql. Trocas na fonte: auth.uid() → public.vp_uid(),
-- auth.role() → public.request_role(), auth.users → neon_auth."user", papel anon → anonymous.
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

-- Cadastro: o país de residência (ISO, sem padrão fixo) é validado em
-- complete_signup() (0006). No Neon o gatilho handle_new_user() (0002) só cria o perfil.
