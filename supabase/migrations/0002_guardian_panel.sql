-- =============================================================================
-- VITRINEPLAYER — painel do responsável e perfil completo do atleta
-- Evolui 0001_init.sql (reaproveita profiles, athletes, athlete_clubs,
-- athlete_media, athlete_views, consents, payments, organizations).
--
-- Regras centrais (garantidas aqui, no banco):
--  * Responsável acessa somente atletas vinculados a ele (athlete_guardians).
--  * Ninguém além de responsáveis vinculados/admin enumera atletas.
--  * Profissional só vê atleta APROVADO + ATIVO + não bloqueado para nenhuma
--    das organizações das quais é membro. A organização não sabe do bloqueio.
--  * Contato do responsável (profiles) segue legível só pelo dono/admin.
--  * Pagamento único (R$ 59,90) antes da revisão; status só avança por
--    webhook/admin. Nenhum checkout fictício existe em migrations.
-- =============================================================================

-- ---------------------------------------------------------------- tipos
create type football_position  as enum ('GK', 'RB', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'CF', 'ST');
create type athlete_sex        as enum ('male', 'female');
create type availability_answer as enum ('yes', 'no', 'open');   -- open = "depende" / "avaliamos propostas"
create type profile_visibility as enum ('active', 'paused', 'hidden');
create type video_type         as enum ('highlights', 'full_match', 'training', 'goal_play', 'other');
create type activity_kind      as enum ('view', 'search_appearance', 'interest');
create type guardian_relation  as enum ('mother', 'father', 'legal_guardian', 'self', 'other');

alter type seeking_kind add value if not exists 'national_opportunity';
alter type seeking_kind add value if not exists 'international_opportunity';

-- Características autodeclaradas (chaves estáveis; rótulos ficam na interface).
create or replace function athlete_trait_keys() returns text[]
  language sql immutable as $$
  select array['speed','finishing','vision','passing','dribbling','heading','marking',
               'strength','leadership','positioning','tackling','crossing','reflexes',
               'distribution','stamina','set_pieces']
$$;

-- ---------------------------------------------------------------- profiles
alter table profiles add column whatsapp text;

-- ---------------------------------------------------------------- vínculo responsável ↔ atleta
create table athlete_guardians (
  athlete_id  uuid not null references athletes (id) on delete cascade,
  profile_id  uuid not null references profiles (id) on delete cascade,
  relation    guardian_relation not null default 'legal_guardian',
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (athlete_id, profile_id)
);
create unique index athlete_guardians_one_primary on athlete_guardians (athlete_id) where is_primary;
create index athlete_guardians_profile on athlete_guardians (profile_id);

-- Migra o dono atual (0001) para o vínculo e remove a FK única.
insert into athlete_guardians (athlete_id, profile_id, is_primary)
  select id, responsible_id, true from athletes;

drop policy athletes_owner_select on athletes;
drop policy athletes_owner_insert on athletes;
drop policy athletes_owner_update on athletes;
drop policy athletes_pro_select   on athletes;
drop policy clubs_owner  on athlete_clubs;
drop policy clubs_pro    on athlete_clubs;
drop policy media_owner  on athlete_media;
drop policy media_pro    on athlete_media;
drop policy views_insert on athlete_views;
drop policy contact_create on contact_requests;
drop policy list_items_org on pro_list_items;
drop policy favorites_own  on pro_favorites;
drop policy notes_org      on pro_notes;
drop policy evals_scout_write on scout_evaluations;
alter table athletes drop column responsible_id;

-- ---------------------------------------------------------------- athletes: perfil completo
alter table athletes
  alter column primary_position drop not null,
  alter column primary_position type football_position using primary_position::football_position,
  drop column secondary_position,
  drop column achievements,
  add column secondary_positions football_position[] not null default '{}',
  add column sex                 athlete_sex,
  add column measured_at         date,           -- última atualização de altura/peso (base em crescimento)
  add column current_club_since  date,
  add column federation          text,
  add column experiences         text,
  add column bio                 text,
  add column available           boolean,        -- disponível para oportunidades
  add column travel              availability_answer,
  add column relocate_city       availability_answer,
  add column relocate_state      availability_answer,
  add column relocate_abroad     availability_answer,
  add column visibility          profile_visibility not null default 'active',
  add constraint athletes_traits_known check (traits <@ athlete_trait_keys()),
  add constraint athletes_secondary_not_primary check (primary_position is null or not (primary_position = any (secondary_positions)));

create index athletes_pro_idx on athletes (status, visibility);

create table athlete_achievements (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references athletes (id) on delete cascade,
  title        text not null check (length(title) between 2 and 120),
  competition  text,
  year         smallint check (year between 1990 and 2100),
  position     smallint not null default 0,
  created_at   timestamptz not null default now()
);
create index athlete_achievements_athlete on athlete_achievements (athlete_id);
create index athlete_clubs_athlete on athlete_clubs (athlete_id);

-- ---------------------------------------------------------------- mídia: fotos (Storage) e vídeos (YouTube)
alter table athlete_media
  alter column url drop not null,
  add column storage_path text,                       -- fotos: {athlete_id}/{arquivo}.webp no bucket privado
  add column external_id  text,                       -- vídeos: ID do YouTube (thumbnail)
  add column description  text check (length(description) <= 280),
  add column video_type   video_type,
  add column width        smallint,
  add column height       smallint,
  add column focal_x      real not null default 0.5 check (focal_x between 0 and 1),   -- enquadramento da foto principal
  add column focal_y      real not null default 0.5 check (focal_y between 0 and 1),
  add column zoom         real not null default 1 check (zoom between 1 and 3),
  add constraint media_photo_has_path  check (kind <> 'photo' or storage_path is not null),
  add constraint media_youtube_has_id  check (kind <> 'youtube' or (external_id ~ '^[A-Za-z0-9_-]{11}$' and url is not null)),
  add constraint media_primary_is_photo check (not is_primary or kind = 'photo');
create unique index athlete_media_one_primary on athlete_media (athlete_id) where is_primary;
create unique index athlete_media_path on athlete_media (storage_path) where storage_path is not null;
create index athlete_media_athlete on athlete_media (athlete_id, kind, position);

-- ---------------------------------------------------------------- atividade (interna)
alter table athlete_views
  add column kind   activity_kind not null default 'view',
  add column source text,                             -- ex.: profile_page, search_results, contact_request
  add column meta   jsonb not null default '{}';
create index athlete_views_athlete on athlete_views (athlete_id, kind, viewed_at desc);

-- ---------------------------------------------------------------- bloqueio por organização
create table athlete_org_blocks (
  athlete_id       uuid not null references athletes (id) on delete cascade,
  organization_id  uuid not null references organizations (id) on delete cascade,
  created_by       uuid not null default auth.uid() references profiles (id),
  created_at       timestamptz not null default now(),
  primary key (athlete_id, organization_id)
);
create index athlete_org_blocks_org on athlete_org_blocks (organization_id);

-- ---------------------------------------------------------------- pagamento único por atleta
create unique index payments_one_paid_per_athlete on payments (athlete_id) where status = 'paid';

-- ---------------------------------------------------------------- funções de apoio
create or replace function my_athlete_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select athlete_id from athlete_guardians where profile_id = auth.uid()
$$;

create or replace function is_my_athlete(p_athlete uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from athlete_guardians where athlete_id = p_athlete and profile_id = auth.uid())
$$;

-- Visível para o profissional atual? (aprovado + ativo + nenhuma org do usuário bloqueada)
create or replace function athlete_visible_to_pro(p_athlete uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select is_approved_pro()
     and exists (select 1 from athletes a where a.id = p_athlete and a.status = 'approved' and a.visibility = 'active')
     and not exists (
       select 1 from athlete_org_blocks b
       join organization_members m on m.organization_id = b.organization_id
       where b.athlete_id = p_athlete and m.profile_id = auth.uid())
$$;

-- Novo atleta + vínculo do responsável em uma operação (insert direto é bloqueado).
create or replace function create_athlete(
  p_full_name text, p_sport_name text, p_birth_date date, p_country char(2),
  p_relation guardian_relation default 'legal_guardian'
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null or auth_role() <> 'RESPONSIBLE' then raise exception 'not allowed'; end if;
  if length(trim(p_full_name)) < 3 then raise exception 'invalid name'; end if;
  if p_birth_date > current_date or p_birth_date < date '1990-01-01' then raise exception 'invalid birth date'; end if;
  insert into athletes (full_name, sport_name, birth_date, country)
    values (trim(p_full_name), nullif(trim(p_sport_name), ''), p_birth_date, upper(p_country))
    returning id into v_id;
  insert into athlete_guardians (athlete_id, profile_id, relation, is_primary) values (v_id, auth.uid(), p_relation, true);
  insert into audit_log (actor_id, action, entity, entity_id) values (auth.uid(), 'athlete.create', 'athletes', v_id);
  return v_id;
end $$;

-- Chamada privilegiada? (webhook com service role ou admin).
-- Não usa current_user: dentro de security definer ele é sempre o dono da função.
create or replace function is_privileged() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(auth.role(), '') = 'service_role' or is_admin()
$$;

-- Responsável: guarda dos campos de revisão e das transições de status.
create or replace function guard_athlete_update() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if not is_privileged() then
    if new.reviewed_by is distinct from old.reviewed_by
       or new.review_note is distinct from old.review_note
       or new.approved_at is distinct from old.approved_at then
      raise exception 'campo não editável';
    end if;
    -- Responsável só: rascunho ⇄ aguardando pagamento, e rejeitado → revisão se já pagou.
    -- Pago → revisão acontece por webhook/admin (mark_payment_paid); nunca pela interface.
    if new.status <> old.status and not (
         (old.status = 'draft' and new.status = 'pending_payment') or
         (old.status = 'pending_payment' and new.status = 'draft') or
         (old.status = 'rejected' and new.status = 'in_review'
            and exists (select 1 from payments where athlete_id = old.id and status = 'paid'))) then
      raise exception 'mudança de status não permitida';
    end if;
    new.submitted_at := case when new.status = 'in_review' and old.status <> 'in_review' then now() else old.submitted_at end;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Confirmação de pagamento: SOMENTE service role (webhook do gateway) ou admin.
create or replace function mark_payment_paid(p_payment uuid, p_provider text, p_provider_ref text) returns void
  language plpgsql security definer set search_path = public as $$
declare v_athlete uuid;
begin
  if not is_privileged() then raise exception 'not allowed'; end if;
  update payments set status = 'paid', paid_at = now(), provider = p_provider, provider_ref = p_provider_ref
    where id = p_payment and status = 'pending' returning athlete_id into v_athlete;
  if v_athlete is null then raise exception 'payment not pending'; end if;
  update athletes set status = 'in_review', submitted_at = now()
    where id = v_athlete and status in ('draft', 'pending_payment');
  insert into audit_log (action, entity, entity_id, meta)
    values ('payment.paid', 'payments', p_payment, jsonb_build_object('provider', p_provider));
end $$;
revoke execute on function mark_payment_paid(uuid, text, text) from public, anon, authenticated;

-- Foto principal: troca atômica dentro da galeria do próprio atleta.
create or replace function set_primary_photo(p_media uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare v_athlete uuid;
begin
  select athlete_id into v_athlete from athlete_media where id = p_media and kind = 'photo';
  if v_athlete is null or not is_my_athlete(v_athlete) then raise exception 'not allowed'; end if;
  update athlete_media set is_primary = false where athlete_id = v_athlete and is_primary;
  update athlete_media set is_primary = true where id = p_media;
end $$;

-- Limite inicial de 12 fotos por atleta.
create or replace function guard_photo_limit() returns trigger
  language plpgsql as $$
begin
  if new.kind = 'photo' and (select count(*) from athlete_media where athlete_id = new.athlete_id and kind = 'photo') >= 12 then
    raise exception 'photo limit reached';
  end if;
  return new;
end $$;
create trigger athlete_media_photo_limit before insert on athlete_media
  for each row execute function guard_photo_limit();

-- Sinais para o responsável: existência e data do último evento por tipo.
-- Nunca retorna contagem nem identidade de quem visualizou.
create or replace function athlete_activity_signals(p_athlete uuid)
  returns table (kind activity_kind, last_at timestamptz)
  language sql stable security definer set search_path = public as $$
  select v.kind, max(v.viewed_at) from athlete_views v
  where v.athlete_id = p_athlete and is_my_athlete(p_athlete)
  group by v.kind
$$;

-- Busca de organizações para "Ocultar meu perfil para": só aprovadas, ≥ 3 letras, máx. 10.
create or replace function search_organizations(p_query text)
  returns table (id uuid, name text, kind pro_org_kind, country char(2))
  language sql stable security definer set search_path = public as $$
  select o.id, o.name, o.kind, o.country from organizations o
  where auth.uid() is not null and length(trim(p_query)) >= 3
    and o.status = 'approved' and o.name ilike '%' || trim(p_query) || '%'
  order by o.name limit 10
$$;

-- Organizações ocultadas de um atleta (nome legível só para o responsável).
create or replace function athlete_blocked_organizations(p_athlete uuid)
  returns table (id uuid, name text, kind pro_org_kind, country char(2), blocked_at timestamptz)
  language sql stable security definer set search_path = public as $$
  select o.id, o.name, o.kind, o.country, b.created_at from athlete_org_blocks b
  join organizations o on o.id = b.organization_id
  where b.athlete_id = p_athlete and is_my_athlete(p_athlete)
  order by b.created_at
$$;

-- Conta criada no Auth → profile (sempre RESPONSIBLE; papéis profissionais só via admin) + consentimentos aceitos no cadastro.
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'); v_kind text;
begin
  insert into profiles (id, role, full_name, email, whatsapp, phone, country, locale)
  values (new.id, 'RESPONSIBLE', coalesce(v_meta->>'full_name', ''), new.email,
          v_meta->>'whatsapp', v_meta->>'whatsapp', coalesce(v_meta->>'country', 'BR'), coalesce(v_meta->>'locale', 'pt-BR'));
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
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------- RLS
alter table athlete_guardians     enable row level security;
alter table athlete_achievements  enable row level security;
alter table athlete_org_blocks    enable row level security;

-- vínculos: o responsável vê os próprios; criação só via create_athlete; demais só admin.
create policy guardians_self  on athlete_guardians for select using (profile_id = auth.uid());
create policy guardians_admin on athlete_guardians for all using (is_admin());

-- athletes: responsável vinculado lê/edita; profissional só o que athlete_visible_to_pro permite.
create policy athletes_guardian_select on athletes for select using (is_my_athlete(id));
create policy athletes_guardian_update on athletes for update using (is_my_athlete(id)) with check (is_my_athlete(id));
create policy athletes_pro_select on athletes for select using (athlete_visible_to_pro(id));

-- tabelas filhas seguem o atleta
create policy clubs_guardian on athlete_clubs for all using (is_my_athlete(athlete_id)) with check (is_my_athlete(athlete_id));
create policy clubs_pro on athlete_clubs for select using (athlete_visible_to_pro(athlete_id));

create policy media_guardian on athlete_media for all using (is_my_athlete(athlete_id)) with check (is_my_athlete(athlete_id));
create policy media_pro on athlete_media for select using (athlete_visible_to_pro(athlete_id));

create policy achievements_guardian on athlete_achievements for all using (is_my_athlete(athlete_id)) with check (is_my_athlete(athlete_id));
create policy achievements_pro on athlete_achievements for select using (athlete_visible_to_pro(athlete_id));
create policy achievements_admin on athlete_achievements for all using (is_admin());

-- bloqueios: só o responsável (e admin). Organizações nunca leem esta tabela.
create policy blocks_guardian on athlete_org_blocks for all
  using (is_my_athlete(athlete_id)) with check (is_my_athlete(athlete_id) and created_by = auth.uid());
create policy blocks_admin on athlete_org_blocks for all using (is_admin());

-- área profissional: toda escrita sobre um atleta exige visibilidade (bloqueio incluso)
create policy views_insert on athlete_views for insert
  with check (viewer_id = auth.uid() and athlete_visible_to_pro(athlete_id));
create policy contact_create on contact_requests for insert
  with check (requested_by = auth.uid() and organization_id in (select my_approved_orgs()) and athlete_visible_to_pro(athlete_id));
create policy list_items_org on pro_list_items for all
  using (list_id in (select id from pro_lists where organization_id in (select my_approved_orgs())))
  with check (list_id in (select id from pro_lists where organization_id in (select my_approved_orgs())) and athlete_visible_to_pro(athlete_id));
create policy favorites_own on pro_favorites for all
  using (profile_id = auth.uid() and is_approved_pro())
  with check (profile_id = auth.uid() and athlete_visible_to_pro(athlete_id));
create policy notes_org on pro_notes for all
  using (organization_id in (select my_approved_orgs()))
  with check (organization_id in (select my_approved_orgs()) and author_id = auth.uid() and athlete_visible_to_pro(athlete_id));
create policy evals_scout_write on scout_evaluations for insert
  with check (auth_role() = 'SCOUT' and author_id = auth.uid() and organization_id in (select my_approved_orgs()) and athlete_visible_to_pro(athlete_id));

-- consentimentos ligados a atleta só para atletas do próprio responsável
drop policy consents_owner_insert on consents;
create policy consents_owner_insert on consents for insert
  with check (profile_id = auth.uid() and (athlete_id is null or is_my_athlete(athlete_id)));

-- ---------------------------------------------------------------- Storage: fotos (bucket privado)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('athlete-photos', 'athlete-photos', false, 5242880, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

-- Caminho obrigatório: {athlete_id}/{arquivo}. Leitura apenas por URL assinada.
create or replace function storage_athlete_id(p_name text) returns uuid
  language plpgsql immutable as $$
begin
  return (storage.foldername(p_name))[1]::uuid;
exception when others then return null;
end $$;

create policy photos_guardian_read on storage.objects for select to authenticated
  using (bucket_id = 'athlete-photos' and is_my_athlete(storage_athlete_id(name)));
create policy photos_guardian_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'athlete-photos' and is_my_athlete(storage_athlete_id(name)));
create policy photos_guardian_delete on storage.objects for delete to authenticated
  using (bucket_id = 'athlete-photos' and is_my_athlete(storage_athlete_id(name)));
create policy photos_pro_read on storage.objects for select to authenticated
  using (bucket_id = 'athlete-photos' and athlete_visible_to_pro(storage_athlete_id(name)));
