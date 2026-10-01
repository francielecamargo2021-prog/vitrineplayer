-- =============================================================================
-- VITRINE — esquema inicial (PostgreSQL / Supabase)
-- Princípio: o acesso aos dados é garantido no BANCO (RLS), não só na interface.
--  * Responsável vê e edita apenas os próprios atletas.
--  * Não existe política que permita a um responsável listar outros atletas.
--  * Profissionais/scouts só leem atletas APROVADOS e apenas após a própria
--    conta profissional ser aprovada — e nunca leem dados de contato.
--  * Dados profissionais (notas, avaliações, listas) são privados da organização.
-- Ainda não aplicado: será executado quando o backend for ligado.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- tipos
create type app_role         as enum ('RESPONSIBLE', 'PROFESSIONAL', 'SCOUT', 'ADMIN');
create type athlete_status   as enum ('draft', 'pending_payment', 'in_review', 'approved', 'rejected', 'suspended');
create type dominant_foot    as enum ('right', 'left', 'both');
create type seeking_kind     as enum ('club', 'representation', 'agent', 'sponsorship', 'evaluation', 'other');
create type media_kind       as enum ('photo', 'youtube', 'video_link');
create type pro_org_kind     as enum ('club', 'scout', 'agent', 'company', 'scouting_hub', 'brand');
create type review_status    as enum ('pending', 'approved', 'rejected', 'suspended');
create type payment_status   as enum ('pending', 'paid', 'failed', 'refunded');
create type contact_status   as enum ('requested', 'forwarded', 'accepted', 'declined', 'expired');
create type notify_channel   as enum ('email', 'whatsapp', 'sms');
create type consent_kind     as enum ('terms', 'privacy', 'guardian_declaration', 'pro_visibility', 'no_guarantee', 'marketing_whatsapp');

-- ---------------------------------------------------------------- contas
-- Um registro por usuário de auth.users. Contém DADOS DE CONTATO: só o dono e ADMIN leem.
create table profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  role               app_role not null default 'RESPONSIBLE',
  full_name          text not null,
  email              text not null,
  phone              text,
  document           text,               -- CPF / DNI / CI (criptografar em repouso na fase de backend)
  country            char(2) not null default 'BR',
  locale             text not null default 'pt-BR',
  email_verified_at  timestamptz,
  phone_verified_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Organizações profissionais (clube, agência, marca…) e vínculo de membros.
create table organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  kind          pro_org_kind not null,
  country       char(2) not null,
  document      text,
  website       text,
  status        review_status not null default 'pending',
  reviewed_by   uuid references profiles (id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);

create table organization_members (
  organization_id uuid not null references organizations (id) on delete cascade,
  profile_id      uuid not null references profiles (id) on delete cascade,
  is_owner        boolean not null default false,
  primary key (organization_id, profile_id)
);

-- ---------------------------------------------------------------- atletas
create table athletes (
  id                  uuid primary key default gen_random_uuid(),
  responsible_id      uuid not null references profiles (id) on delete cascade,
  status              athlete_status not null default 'draft',
  full_name           text not null,
  sport_name          text,
  birth_date          date not null,
  birth_year          int generated always as (extract(year from birth_date)::int) stored,
  country             char(2) not null,
  state               text,
  city                text,
  nationality         text[] not null default '{}',
  primary_position    text not null,
  secondary_position  text,
  foot                dominant_foot,
  height_cm           smallint check (height_cm between 80 and 230),
  weight_kg           smallint check (weight_kg between 15 and 150),
  current_club        text,
  category            text,
  federated           boolean not null default false,
  competitions        text[] not null default '{}',
  achievements        text[] not null default '{}',
  traits              text[] not null default '{}',
  goals               text,
  seeking             seeking_kind[] not null default '{}',
  submitted_at        timestamptz,
  approved_at         timestamptz,
  reviewed_by         uuid references profiles (id),
  review_note         text,               -- interno (ADMIN)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index athletes_search_idx on athletes (status, birth_year, primary_position, foot, country, state);

create table athlete_clubs (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references athletes (id) on delete cascade,
  club        text not null,
  category    text,
  started_on  date,
  ended_on    date
);

-- MVP: sem vídeos próprios. Fotos no Storage (bucket privado) e vídeos como URL do YouTube.
create table athlete_media (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references athletes (id) on delete cascade,
  kind        media_kind not null,
  url         text not null,
  title       text,
  is_primary  boolean not null default false,
  position    smallint not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- LGPD
create table consents (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles (id) on delete cascade,
  athlete_id    uuid references athletes (id) on delete cascade,
  kind          consent_kind not null,
  version       text not null,            -- versão do documento aceito
  granted_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  ip            inet,
  user_agent    text
);

create table payments (
  id              uuid primary key default gen_random_uuid(),
  athlete_id      uuid not null references athletes (id) on delete restrict,
  payer_id        uuid not null references profiles (id),
  provider        text,                   -- definido na fase de pagamento
  provider_ref    text,
  amount_cents    int not null default 5990,
  currency        char(3) not null default 'BRL',
  status          payment_status not null default 'pending',
  paid_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------- área profissional
create table pro_lists (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  name             text not null,
  created_by       uuid not null references profiles (id),
  created_at       timestamptz not null default now()
);

create table pro_list_items (
  list_id     uuid not null references pro_lists (id) on delete cascade,
  athlete_id  uuid not null references athletes (id) on delete cascade,
  added_by    uuid not null references profiles (id),
  added_at    timestamptz not null default now(),
  primary key (list_id, athlete_id)
);

create table pro_favorites (
  profile_id  uuid not null references profiles (id) on delete cascade,
  athlete_id  uuid not null references athletes (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (profile_id, athlete_id)
);

create table pro_notes (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  athlete_id       uuid not null references athletes (id) on delete cascade,
  author_id        uuid not null references profiles (id),
  body             text not null,
  tags             text[] not null default '{}',
  created_at       timestamptz not null default now()
);

create table scout_evaluations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  athlete_id       uuid not null references athletes (id) on delete cascade,
  author_id        uuid not null references profiles (id),
  technical        smallint check (technical between 0 and 10),
  tactical         smallint check (tactical between 0 and 10),
  physical         smallint check (physical between 0 and 10),
  mental           smallint check (mental between 0 and 10),
  potential        smallint check (potential between 0 and 10),
  observation      text,
  created_at       timestamptz not null default now()
);

create table athlete_views (
  id               bigint generated always as identity primary key,
  athlete_id       uuid not null references athletes (id) on delete cascade,
  viewer_id        uuid not null references profiles (id),
  organization_id  uuid references organizations (id),
  viewed_at        timestamptz not null default now()
);

-- Contato SEMPRE intermediado: o profissional pede, a VITRINE encaminha ao responsável.
create table contact_requests (
  id               uuid primary key default gen_random_uuid(),
  athlete_id       uuid not null references athletes (id) on delete cascade,
  organization_id  uuid not null references organizations (id),
  requested_by     uuid not null references profiles (id),
  message          text not null,
  status           contact_status not null default 'requested',
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);

-- ---------------------------------------------------------------- notificações (WhatsApp futuro)
-- Outbox: a aplicação só enfileira; um worker futuro envia via API oficial.
create table notification_outbox (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles (id) on delete cascade,
  channel       notify_channel not null,
  template      text not null,           -- ex.: profile_approved, profile_incomplete, contact_request
  payload       jsonb not null default '{}',
  status        text not null default 'queued',
  attempts      smallint not null default 0,
  scheduled_at  timestamptz not null default now(),
  sent_at       timestamptz
);

create table audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references profiles (id),
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- funções de apoio
create or replace function auth_role() returns app_role
  language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() = 'ADMIN', false)
$$;

-- Organizações APROVADAS das quais o usuário é membro.
create or replace function my_approved_orgs() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select m.organization_id
  from organization_members m
  join organizations o on o.id = m.organization_id
  where m.profile_id = auth.uid() and o.status = 'approved'
$$;

create or replace function is_approved_pro() returns boolean
  language sql stable security definer set search_path = public as $$
  select auth_role() in ('PROFESSIONAL', 'SCOUT') and exists (select 1 from my_approved_orgs())
$$;

-- Responsável não pode alterar status/campos de revisão nem trocar o dono.
create or replace function guard_athlete_update() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    if new.responsible_id <> old.responsible_id
       or new.reviewed_by is distinct from old.reviewed_by
       or new.review_note is distinct from old.review_note
       or new.approved_at is distinct from old.approved_at then
      raise exception 'campo não editável';
    end if;
    -- único avanço permitido ao responsável: draft → pending_payment
    if new.status <> old.status and not (old.status = 'draft' and new.status = 'pending_payment') then
      raise exception 'mudança de status não permitida';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger athletes_guard before update on athletes
  for each row execute function guard_athlete_update();

-- ---------------------------------------------------------------- RLS
alter table profiles              enable row level security;
alter table organizations         enable row level security;
alter table organization_members  enable row level security;
alter table athletes              enable row level security;
alter table athlete_clubs         enable row level security;
alter table athlete_media         enable row level security;
alter table consents              enable row level security;
alter table payments              enable row level security;
alter table pro_lists             enable row level security;
alter table pro_list_items        enable row level security;
alter table pro_favorites         enable row level security;
alter table pro_notes             enable row level security;
alter table scout_evaluations     enable row level security;
alter table athlete_views         enable row level security;
alter table contact_requests      enable row level security;
alter table notification_outbox   enable row level security;
alter table audit_log             enable row level security;

-- profiles: só o próprio e admin. Profissionais NUNCA leem contato de responsáveis.
create policy profiles_self   on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_update on profiles for update using (id = auth.uid())
  with check (id = auth.uid() and role = auth_role());   -- não pode se promover
create policy profiles_admin  on profiles for all using (is_admin());

-- organizations
create policy org_member_read on organizations for select
  using (is_admin() or id in (select organization_id from organization_members where profile_id = auth.uid()));
create policy org_admin on organizations for all using (is_admin());
create policy orgm_read on organization_members for select using (profile_id = auth.uid() or is_admin());
create policy orgm_admin on organization_members for all using (is_admin());

-- athletes: dono (responsável), profissional aprovado (somente aprovados) ou admin.
create policy athletes_owner_select on athletes for select using (responsible_id = auth.uid());
create policy athletes_owner_insert on athletes for insert
  with check (responsible_id = auth.uid() and auth_role() = 'RESPONSIBLE' and status = 'draft');
create policy athletes_owner_update on athletes for update
  using (responsible_id = auth.uid()) with check (responsible_id = auth.uid());
create policy athletes_pro_select on athletes for select using (status = 'approved' and is_approved_pro());
create policy athletes_admin on athletes for all using (is_admin());

-- clubes e mídia seguem a visibilidade do atleta
create policy clubs_owner on athlete_clubs for all
  using (athlete_id in (select id from athletes where responsible_id = auth.uid()));
create policy clubs_pro on athlete_clubs for select
  using (is_approved_pro() and athlete_id in (select id from athletes where status = 'approved'));
create policy clubs_admin on athlete_clubs for all using (is_admin());

create policy media_owner on athlete_media for all
  using (athlete_id in (select id from athletes where responsible_id = auth.uid()));
create policy media_pro on athlete_media for select
  using (is_approved_pro() and athlete_id in (select id from athletes where status = 'approved'));
create policy media_admin on athlete_media for all using (is_admin());

-- consentimentos: imutáveis para o usuário (só insere e revoga via função futura)
create policy consents_owner_read on consents for select using (profile_id = auth.uid() or is_admin());
create policy consents_owner_insert on consents for insert with check (profile_id = auth.uid());

-- pagamentos: leitura pelo pagador; escrita apenas via service role (webhook do provedor)
create policy payments_owner_read on payments for select using (payer_id = auth.uid() or is_admin());

-- área profissional: sempre restrita à organização aprovada do usuário
create policy lists_org on pro_lists for all
  using (organization_id in (select my_approved_orgs())) with check (organization_id in (select my_approved_orgs()));
create policy list_items_org on pro_list_items for all
  using (list_id in (select id from pro_lists where organization_id in (select my_approved_orgs())));
create policy favorites_own on pro_favorites for all
  using (profile_id = auth.uid() and is_approved_pro()) with check (profile_id = auth.uid() and is_approved_pro());
create policy notes_org on pro_notes for all
  using (organization_id in (select my_approved_orgs()))
  with check (organization_id in (select my_approved_orgs()) and author_id = auth.uid());
create policy evals_org_read on scout_evaluations for select
  using (organization_id in (select my_approved_orgs()) or is_admin());
create policy evals_scout_write on scout_evaluations for insert
  with check (auth_role() = 'SCOUT' and author_id = auth.uid() and organization_id in (select my_approved_orgs()));
create policy views_insert on athlete_views for insert with check (viewer_id = auth.uid() and is_approved_pro());
create policy views_read on athlete_views for select using (viewer_id = auth.uid() or is_admin());
create policy contact_org on contact_requests for select
  using (organization_id in (select my_approved_orgs()) or is_admin());
create policy contact_create on contact_requests for insert
  with check (requested_by = auth.uid() and organization_id in (select my_approved_orgs()));
create policy contact_admin on contact_requests for update using (is_admin());

-- outbox e auditoria: apenas admin/service role
create policy outbox_admin on notification_outbox for all using (is_admin());
create policy audit_admin on audit_log for select using (is_admin());
