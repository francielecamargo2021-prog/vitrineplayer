-- =============================================================================
-- VITRINEPLAYER — Portal dos profissionais (clubes, empresários, agentes, olheiros,
-- escolinhas e núcleos de captação). Plano: experimentos/neon/PLANO-PORTAL-PROFISSIONAIS.md
--
--  1. CORREÇÃO DE EXPOSIÇÃO: o profissional deixa de ler as tabelas do atleta
--     diretamente (a política antiga liberava a linha inteira, inclusive a nota interna
--     do admin, o responsável e a data de nascimento). Agora ele só recebe o que as
--     funções pro_* devolvem: cartão e ficha com campos escolhidos, sem nenhum contato.
--     Menor de idade aparece só com o nome esportivo ou o primeiro nome; localização
--     só estado e país.
--  2. Cadastro do profissional (organização entra como "pendente"; só o admin aprova).
--  3. Busca com filtros, ficha, favoritos e listas privadas da organização.
--  4. Interesse: chega direto ao responsável, que aceita, recusa, bloqueia ou denuncia.
--     Nenhum dado da família é liberado ao profissional; ao aceitar, a FAMÍLIA recebe o
--     contato oficial da organização e decide se e como falar.
--  5. Limites configuráveis pelo admin: fichas por dia por profissional e interesses
--     por mês por organização (valores iniciais 100 e 30). Acesso gratuito.
--
-- Valores novos de enum não são usados como constantes nesta mesma transação
-- (só em plpgsql, avaliado na execução).
-- =============================================================================

-- ---------------------------------------------------------------- tipos
alter type pro_org_kind add value if not exists 'school';    -- escolinha
alter type pro_org_kind add value if not exists 'manager';   -- empresário
alter type consent_kind add value if not exists 'pro_conduct';

-- ---------------------------------------------------------------- 1. exposição: sem leitura direta pelo profissional
drop policy if exists athletes_pro_select on athletes;
drop policy if exists media_pro           on athlete_media;
drop policy if exists achievements_pro    on athlete_achievements;
drop policy if exists clubs_pro           on athlete_clubs;
drop policy if exists views_insert        on athlete_views;     -- visualização só pela ficha (limite diário)
drop policy if exists contact_create      on contact_requests;  -- interesse só por pro_send_interest (limites)
drop policy if exists contact_org         on contact_requests;  -- organização lê só por pro_my_interests (sem denúncia)
create policy contact_admin_read on contact_requests for select using (is_admin());

-- ---------------------------------------------------------------- organizações: dados para a verificação
alter table organizations
  add column state         text check (length(state) <= 80),
  add column city          text check (length(city) <= 80),
  add column license       text check (length(license) <= 80),          -- licença de agente / registro na federação
  add column contact_name  text check (length(contact_name) <= 120),
  add column contact_role  text check (length(contact_role) <= 80),
  add column contact_email text check (length(contact_email) <= 254),
  add column contact_phone text check (length(contact_phone) <= 20),
  add column about         text check (length(about) <= 600),
  add column review_note   text check (length(review_note) <= 1000);

-- ---------------------------------------------------------------- limites (configuráveis pelo admin)
create table portal_settings (
  id                    boolean primary key default true check (id),
  profile_views_per_day int not null default 100 check (profile_views_per_day between 1 and 10000),
  interests_per_month   int not null default 30  check (interests_per_month between 1 and 1000),
  interest_expiry_days  int not null default 30  check (interest_expiry_days between 1 and 365),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references profiles (id) on delete set null
);
insert into portal_settings default values;
alter table portal_settings enable row level security;
create policy portal_settings_read  on portal_settings for select to authenticated using (true);
create policy portal_settings_admin on portal_settings for update using (is_admin()) with check (is_admin());
revoke insert, delete on portal_settings from anonymous, authenticated;

-- ---------------------------------------------------------------- interesses
alter table contact_requests
  add column responded_by  uuid references profiles (id) on delete set null,
  add column reported_at   timestamptz,
  add column report_reason text check (length(report_reason) <= 500),
  add constraint contact_message_length check (length(message) between 10 and 500);
create unique index contact_one_open on contact_requests (athlete_id, organization_id) where status = 'requested';
create index contact_org_month on contact_requests (organization_id, created_at);
create index athlete_views_viewer on athlete_views (viewer_id, kind, viewed_at desc);

-- listas: só quem cria assina a lista
drop policy if exists lists_org on pro_lists;
create policy lists_org on pro_lists for all
  using (organization_id in (select my_approved_orgs()))
  with check (organization_id in (select my_approved_orgs()) and created_by = public.vp_uid() and length(trim(name)) between 1 and 60);

-- ---------------------------------------------------------------- funções auxiliares
-- Nome mostrado ao profissional: menor = nome esportivo ou primeiro nome (sem sobrenome).
create or replace function pro_display_name(p_full text, p_sport text, p_birth date) returns text
  language sql stable set search_path = public as $$
  select case when age(current_date, p_birth) < interval '18 years'
              then coalesce(nullif(trim(p_sport), ''), split_part(trim(p_full), ' ', 1))
              else coalesce(nullif(trim(p_sport), ''), trim(p_full)) end
$$;

-- Organização aprovada do profissional atual (dona primeiro).
create or replace function my_pro_org() returns uuid
  language sql stable security definer set search_path = public as $$
  select m.organization_id from organization_members m join organizations o on o.id = m.organization_id
   where m.profile_id = public.vp_uid() and o.status = 'approved'
   order by m.is_owner desc, o.created_at limit 1
$$;

-- Situação do interesse, contando o prazo de expiração.
create or replace function interest_status(p_status contact_status, p_created timestamptz) returns text
  language sql stable security definer set search_path = public as $$
  select case when p_status = 'requested'
               and p_created < now() - make_interval(days => (select interest_expiry_days from portal_settings))
              then 'expired' else p_status::text end
$$;

-- Cartões (lista/busca): só atletas visíveis ao profissional; sem contato, sem data completa, sem cidade.
create or replace function pro_cards(p_ids uuid[]) returns table (
  id uuid, display_name text, age int, birth_year int, sex text, modality text,
  primary_position text, secondary_positions text[], foot text, height_cm smallint,
  state text, country text, current_club text, category text, available boolean,
  seeking text[], has_video boolean, photo text, focal_x real, focal_y real, zoom real,
  is_favorite boolean, approved_at timestamptz
) language sql stable security definer set search_path = public as $$
  select a.id, pro_display_name(a.full_name, a.sport_name, a.birth_date),
         extract(year from age(current_date, a.birth_date))::int, a.birth_year, a.sex::text, a.modality::text,
         a.primary_position::text, a.secondary_positions::text[], a.foot::text, a.height_cm,
         a.state, a.country::text, a.current_club, a.category, a.available, a.seeking::text[],
         exists (select 1 from athlete_media v where v.athlete_id = a.id and v.kind = 'youtube'),
         p.storage_path, p.focal_x, p.focal_y, p.zoom,
         exists (select 1 from pro_favorites f where f.athlete_id = a.id and f.profile_id = public.vp_uid()),
         a.approved_at
    from unnest(p_ids) with ordinality u(aid, ord)
    join athletes a on a.id = u.aid
    left join athlete_media p on p.athlete_id = a.id and p.is_primary
   where public.vp_uid() is not null and athlete_visible_to_pro(a.id)
   order by u.ord
$$;

-- ---------------------------------------------------------------- busca
create or replace function pro_search_athletes(p_filters jsonb default '{}', p_page int default 1)
  returns table (
    id uuid, display_name text, age int, birth_year int, sex text, modality text,
    primary_position text, secondary_positions text[], foot text, height_cm smallint,
    state text, country text, current_club text, category text, available boolean,
    seeking text[], has_video boolean, photo text, focal_x real, focal_y real, zoom real,
    is_favorite boolean, approved_at timestamptz, total bigint)
  language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  f jsonb := coalesce(p_filters, '{}');
  v_uid uuid := public.vp_uid();
  v_size int := 24;
  v_page int := least(greatest(coalesce(p_page, 1), 1), 500);
  v_pos text[] := array(select jsonb_array_elements_text(case when jsonb_typeof(f->'positions') = 'array' then f->'positions' else '[]' end));
  v_ids uuid[];
  v_total bigint;
begin
  if v_uid is null or not is_approved_pro() then return; end if;
  with m as (
    select a.id as aid, a.approved_at as ap from athletes a
     where a.status = 'approved' and a.visibility = 'active' and athlete_visible_to_pro(a.id)
       and (f->>'modality' is null or a.modality::text = f->>'modality')
       and (cardinality(v_pos) = 0 or a.primary_position::text = any (v_pos) or a.secondary_positions::text[] && v_pos)
       and (f->>'age_min' is null or extract(year from age(current_date, a.birth_date)) >= (f->>'age_min')::int)
       and (f->>'age_max' is null or extract(year from age(current_date, a.birth_date)) <= (f->>'age_max')::int)
       and (f->>'sex' is null or a.sex::text = f->>'sex')
       and (f->>'foot' is null or a.foot::text = f->>'foot')
       and (f->>'country' is null or a.country::text = upper(f->>'country'))
       and (f->>'state' is null or a.state ilike trim(f->>'state'))
       and (f->>'height_min' is null or a.height_cm >= (f->>'height_min')::int)
       and (f->>'available' is null or a.available is true)
       and (f->>'relocate_abroad' is null or a.relocate_abroad::text in ('yes', 'open'))
       and (f->>'seeking' is null or a.seeking::text[] @> array[f->>'seeking'])
       and (f->>'with_video' is null or exists (select 1 from athlete_media v where v.athlete_id = a.id and v.kind = 'youtube'))
  )
  select array(select aid from m order by ap desc nulls last, aid limit v_size offset (v_page - 1) * v_size),
         (select count(*) from m)
    into v_ids, v_total;

  -- sinal para a família: "apareceu em buscas" (no máximo 1 por profissional/atleta/dia)
  insert into athlete_views (athlete_id, viewer_id, organization_id, kind, source)
  select x, v_uid, my_pro_org(), 'search_appearance', 'search_results' from unnest(v_ids) x
   where not exists (select 1 from athlete_views w where w.athlete_id = x and w.viewer_id = v_uid
                       and w.kind = 'search_appearance' and w.viewed_at > now() - interval '1 day');

  return query select c.*, v_total from pro_cards(v_ids) c;
end $$;

-- Favoritos do profissional e itens de uma lista da organização (cartões).
create or replace function pro_saved_athletes(p_list uuid default null)
  returns table (
    id uuid, display_name text, age int, birth_year int, sex text, modality text,
    primary_position text, secondary_positions text[], foot text, height_cm smallint,
    state text, country text, current_club text, category text, available boolean,
    seeking text[], has_video boolean, photo text, focal_x real, focal_y real, zoom real,
    is_favorite boolean, approved_at timestamptz)
  language sql stable security definer set search_path = public as $$
  select * from pro_cards(case
    when p_list is null then array(select f.athlete_id from pro_favorites f where f.profile_id = public.vp_uid() order by f.created_at desc)
    else array(select i.athlete_id from pro_list_items i join pro_lists l on l.id = i.list_id
                where i.list_id = p_list and l.organization_id in (select my_approved_orgs()) order by i.added_at desc)
  end)
  where is_approved_pro()
$$;

-- ---------------------------------------------------------------- ficha (com limite diário)
create or replace function pro_athlete_profile(p_athlete uuid) returns jsonb
  language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := public.vp_uid();
  v_org uuid;
  v_limit int;
  v_seen int;
  a athletes;
begin
  if v_uid is null or not is_approved_pro() or p_athlete is null or not athlete_visible_to_pro(p_athlete) then
    raise exception 'not found';
  end if;
  v_org := my_pro_org();
  -- limite: fichas DIFERENTES abertas hoje (reabrir a mesma não conta de novo)
  if not exists (select 1 from athlete_views where viewer_id = v_uid and athlete_id = p_athlete and kind = 'view'
                   and viewed_at >= date_trunc('day', now())) then
    select profile_views_per_day into v_limit from portal_settings;
    select count(distinct athlete_id) into v_seen from athlete_views
     where viewer_id = v_uid and kind = 'view' and viewed_at >= date_trunc('day', now());
    if v_seen >= v_limit then raise exception 'daily limit'; end if;
  end if;
  insert into athlete_views (athlete_id, viewer_id, organization_id, kind, source)
  values (p_athlete, v_uid, v_org, 'view', 'profile_page');

  select * into a from athletes where athletes.id = p_athlete;
  return jsonb_build_object(
    'card', (select to_jsonb(c) from pro_cards(array[p_athlete]) c),
    'bio', a.bio, 'goals', a.goals, 'experiences', a.experiences,
    'weight_kg', a.weight_kg, 'measured_at', a.measured_at,
    'nationality', a.nationality, 'other_citizenships', a.other_citizenships, 'valid_passport', a.valid_passport,
    'federated', a.federated, 'federation', a.federation, 'current_club_since', a.current_club_since,
    'travel', a.travel, 'relocate_city', a.relocate_city, 'relocate_state', a.relocate_state, 'relocate_abroad', a.relocate_abroad,
    'photos', (select coalesce(jsonb_agg(jsonb_build_object('name', m.storage_path, 'x', m.focal_x, 'y', m.focal_y, 'zoom', m.zoom, 'primary', m.is_primary)
                                         order by m.is_primary desc, m.position, m.created_at), '[]')
                 from athlete_media m where m.athlete_id = p_athlete and m.kind = 'photo'),
    'videos', (select coalesce(jsonb_agg(jsonb_build_object('youtube', m.external_id, 'title', m.title, 'description', m.description, 'type', m.video_type)
                                         order by m.position, m.created_at), '[]')
                 from athlete_media m where m.athlete_id = p_athlete and m.kind = 'youtube'),
    'clubs', (select coalesce(jsonb_agg(jsonb_build_object('club', c.club, 'category', c.category, 'from', c.started_on, 'to', c.ended_on)
                                        order by c.started_on desc nulls last), '[]')
                from athlete_clubs c where c.athlete_id = p_athlete),
    'achievements', (select coalesce(jsonb_agg(jsonb_build_object('title', x.title, 'competition', x.competition, 'year', x.year)
                                               order by x.position, x.created_at), '[]')
                       from athlete_achievements x where x.athlete_id = p_athlete),
    'lists', (select coalesce(jsonb_agg(i.list_id), '[]') from pro_list_items i join pro_lists l on l.id = i.list_id
               where i.athlete_id = p_athlete and l.organization_id in (select my_approved_orgs())),
    'interest', (select jsonb_build_object('status', interest_status(r.status, r.created_at), 'created_at', r.created_at)
                   from contact_requests r where r.athlete_id = p_athlete and r.organization_id = v_org
                  order by r.created_at desc limit 1)
  );
end $$;

-- ---------------------------------------------------------------- conta do profissional (situação + uso dos limites)
create or replace function pro_account() returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'role', auth_role(),
    'approved', is_approved_pro(),
    'organization', (select jsonb_build_object('id', o.id, 'name', o.name, 'kind', o.kind, 'country', o.country, 'state', o.state,
                                               'status', o.status, 'review_note', case when o.status in ('rejected', 'suspended') then o.review_note end,
                                               'is_owner', m.is_owner)
                       from organization_members m join organizations o on o.id = m.organization_id
                      where m.profile_id = public.vp_uid() order by (o.status = 'approved') desc, m.is_owner desc, o.created_at limit 1),
    'limits', (select jsonb_build_object('views_per_day', s.profile_views_per_day, 'interests_per_month', s.interests_per_month,
                                         'interest_expiry_days', s.interest_expiry_days) from portal_settings s),
    'usage', jsonb_build_object(
      'views_today', (select count(distinct v.athlete_id) from athlete_views v where v.viewer_id = public.vp_uid() and v.kind = 'view'
                         and v.viewed_at >= date_trunc('day', now())),
      'interests_month', (select count(*) from contact_requests r where r.organization_id = my_pro_org()
                             and r.created_at >= date_trunc('month', now())))
  )
  where public.vp_uid() is not null
$$;

-- ---------------------------------------------------------------- interesse
create or replace function pro_send_interest(p_athlete uuid, p_message text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.vp_uid();
  v_org uuid;
  v_msg text := regexp_replace(trim(coalesce(p_message, '')), '\s+', ' ', 'g');
  v_limit int;
  v_used int;
  v_id uuid;
begin
  if v_uid is null or not is_approved_pro() or p_athlete is null or not athlete_visible_to_pro(p_athlete) then
    raise exception 'not found';
  end if;
  if length(v_msg) < 10 or length(v_msg) > 500 then raise exception 'message length'; end if;
  -- o contato acontece só depois que a família aceita: nada de links, e-mails ou telefones na mensagem
  if v_msg ~* '(https?://|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|(\+?\d[\s().-]*){9,})' then
    raise exception 'message contact';
  end if;
  v_org := my_pro_org();
  perform 1 from organizations where id = v_org for update;   -- serializa o limite mensal da organização

  update contact_requests set status = 'expired', resolved_at = now()
   where athlete_id = p_athlete and organization_id = v_org and status = 'requested'
     and interest_status(status, created_at) = 'expired';
  if exists (select 1 from contact_requests where athlete_id = p_athlete and organization_id = v_org and status = 'requested') then
    raise exception 'already open';
  end if;
  if exists (select 1 from contact_requests where athlete_id = p_athlete and organization_id = v_org
               and status in ('declined', 'accepted') and coalesce(resolved_at, created_at) > now() - interval '90 days') then
    raise exception 'recently answered';
  end if;
  select interests_per_month into v_limit from portal_settings;
  select count(*) into v_used from contact_requests where organization_id = v_org and created_at >= date_trunc('month', now());
  if v_used >= v_limit then raise exception 'monthly limit'; end if;

  insert into contact_requests (athlete_id, organization_id, requested_by, message)
  values (p_athlete, v_org, v_uid, v_msg) returning id into v_id;
  insert into athlete_views (athlete_id, viewer_id, organization_id, kind, source)
  values (p_athlete, v_uid, v_org, 'interest', 'contact_request');
  -- aviso aos responsáveis (fila; o envio por e-mail depende do provedor, ainda não escolhido)
  insert into notification_outbox (profile_id, channel, template, payload)
  select g.profile_id, 'email', 'interest_received', jsonb_build_object('athlete_id', p_athlete, 'request_id', v_id)
    from athlete_guardians g where g.athlete_id = p_athlete;
  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (v_uid, 'interest.create', 'contact_requests', v_id, jsonb_build_object('athlete_id', p_athlete, 'organization_id', v_org));
  return v_id;
end $$;

-- Interesses enviados pela organização (sem denúncias e sem dados da família).
create or replace function pro_my_interests() returns table (
  id uuid, athlete_id uuid, athlete_name text, status text, message text, created_at timestamptz, resolved_at timestamptz
) language sql stable security definer set search_path = public as $$
  select r.id, r.athlete_id,
         case when athlete_visible_to_pro(r.athlete_id) then pro_display_name(a.full_name, a.sport_name, a.birth_date) end,
         interest_status(r.status, r.created_at), r.message, r.created_at, r.resolved_at
    from contact_requests r join athletes a on a.id = r.athlete_id
   where is_approved_pro() and r.organization_id in (select my_approved_orgs())
   order by r.created_at desc
   limit 300
$$;

-- Interesses recebidos pelos atletas do responsável. O contato oficial da organização
-- aparece só depois que a família aceita.
create or replace function guardian_interests() returns table (
  id uuid, athlete_id uuid, athlete_name text, organization_id uuid, org_name text, org_kind text,
  org_country text, org_state text, org_city text, org_verified boolean, org_about text, message text,
  status text, created_at timestamptz, resolved_at timestamptz, reported boolean, blocked boolean, org_contact jsonb
) language sql stable security definer set search_path = public as $$
  select r.id, r.athlete_id, coalesce(nullif(trim(a.sport_name), ''), a.full_name),
         o.id, o.name, o.kind::text, o.country::text, o.state, o.city, o.status = 'approved', o.about, r.message,
         interest_status(r.status, r.created_at), r.created_at, r.resolved_at, r.reported_at is not null,
         exists (select 1 from athlete_org_blocks b where b.athlete_id = r.athlete_id and b.organization_id = r.organization_id),
         case when r.status = 'accepted' then jsonb_build_object('name', o.contact_name, 'role', o.contact_role,
              'email', o.contact_email, 'phone', o.contact_phone, 'website', o.website) end
    from contact_requests r
    join athletes a on a.id = r.athlete_id
    join organizations o on o.id = r.organization_id
   where public.vp_uid() is not null and is_my_athlete(r.athlete_id)
   order by (interest_status(r.status, r.created_at) = 'requested') desc, r.created_at desc
   limit 300
$$;

-- Resposta da família: accept | decline | block | report.
create or replace function respond_interest(p_request uuid, p_action text, p_reason text default null) returns text
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.vp_uid();
  r contact_requests;
  v_state text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into r from contact_requests where id = p_request for update;
  if v_uid is null or r.id is null or not is_my_athlete(r.athlete_id) then raise exception 'not found'; end if;
  if p_action not in ('accept', 'decline', 'block', 'report') then raise exception 'invalid action'; end if;
  v_state := interest_status(r.status, r.created_at);
  if p_action in ('accept', 'decline') and v_state <> 'requested' then raise exception 'invalid transition'; end if;
  if p_action = 'report' and (v_reason is null or length(v_reason) < 5) then raise exception 'reason required'; end if;
  if length(v_reason) > 500 then raise exception 'reason too long'; end if;

  if p_action = 'accept' then
    update contact_requests set status = 'accepted', resolved_at = now(), responded_by = v_uid where id = r.id;
    insert into notification_outbox (profile_id, channel, template, payload)
    values (r.requested_by, 'email', 'interest_accepted', jsonb_build_object('request_id', r.id));
  else
    if v_state = 'requested' then
      update contact_requests set status = 'declined', resolved_at = now(), responded_by = v_uid where id = r.id;
    end if;
    if p_action = 'block' then
      insert into athlete_org_blocks (athlete_id, organization_id, created_by)
      values (r.athlete_id, r.organization_id, v_uid) on conflict do nothing;
    elsif p_action = 'report' then
      update contact_requests set reported_at = now(), report_reason = v_reason where id = r.id;
    end if;
  end if;
  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (v_uid, 'interest.' || p_action, 'contact_requests', r.id,
          jsonb_build_object('athlete_id', r.athlete_id, 'organization_id', r.organization_id));
  return p_action;
end $$;

-- ---------------------------------------------------------------- cadastro do profissional
-- Conta nova (sem atletas e sem cadastro concluído) vira PROFISSIONAL e cria a
-- organização como "pendente". Só o admin aprova (admin_review_organization).
create or replace function complete_professional_signup(
  p_whatsapp text, p_country text, p_locale text, p_consents text[], p_consent_version text,
  p_org jsonb, p_ip text default null, p_ua text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.vp_uid();
  v_country text := upper(coalesce(p_country, ''));
  v_org_country text := upper(coalesce(p_org->>'country', p_country, ''));
  v_kind text := p_org->>'kind';
  v_name text := trim(coalesce(p_org->>'name', ''));
  v_doc text := trim(coalesce(p_org->>'document', ''));
  v_site text := nullif(trim(coalesce(p_org->>'website', '')), '');
  v_profile profiles;
  v_c text;
  v_org uuid;
begin
  if v_uid is null then raise exception 'not allowed'; end if;
  select * into v_profile from profiles where id = v_uid for update;
  if v_profile.id is null then raise exception 'not allowed'; end if;
  if exists (select 1 from consents where profile_id = v_uid and athlete_id is null) then raise exception 'signup already completed'; end if;
  if v_profile.role <> 'RESPONSIBLE' or exists (select 1 from athlete_guardians where profile_id = v_uid) then
    raise exception 'not allowed';
  end if;
  if v_kind is null or v_kind not in ('club', 'manager', 'agent', 'scout', 'school', 'scouting_hub') then raise exception 'invalid kind'; end if;
  if length(v_name) not between 2 and 120 or length(v_doc) not between 3 and 40 then raise exception 'organization required'; end if;
  if v_country !~ '^[A-Z]{2}$' or v_org_country !~ '^[A-Z]{2}$' then raise exception 'country'; end if;
  if v_site is not null and (v_site !~* '^https?://[^\s]+$' or length(v_site) > 200) then raise exception 'website'; end if;
  if length(trim(coalesce(p_org->>'contact_role', ''))) not between 2 and 80 then raise exception 'organization required'; end if;
  if not (coalesce(p_consents, '{}') @> array['terms', 'privacy', 'pro_conduct']) then raise exception 'consents'; end if;

  update profiles set role = 'PROFESSIONAL',
         whatsapp = nullif(p_whatsapp, ''), phone = nullif(p_whatsapp, ''), country = v_country,
         locale = case when p_locale in ('pt-BR', 'es') then p_locale else 'pt-BR' end
   where id = v_uid;
  foreach v_c in array p_consents loop
    if v_c in ('terms', 'privacy', 'pro_conduct', 'no_guarantee') then
      insert into consents (profile_id, kind, version, ip, user_agent)
      values (v_uid, v_c::consent_kind, coalesce(p_consent_version, 'unversioned'),
              case when p_ip ~ '^[0-9A-Fa-f:.]{3,45}$' then p_ip::inet end, left(p_ua, 300));
    end if;
  end loop;

  insert into organizations (name, kind, country, state, city, document, license, website, about,
                             contact_name, contact_role, contact_email, contact_phone, status)
  values (v_name, v_kind::pro_org_kind, v_org_country,
          nullif(left(trim(coalesce(p_org->>'state', '')), 80), ''), nullif(left(trim(coalesce(p_org->>'city', '')), 80), ''),
          left(v_doc, 40), nullif(left(trim(coalesce(p_org->>'license', '')), 80), ''), v_site,
          nullif(left(trim(coalesce(p_org->>'about', '')), 600), ''),
          left(v_profile.full_name, 120), left(trim(p_org->>'contact_role'), 80), v_profile.email, nullif(left(p_whatsapp, 20), ''),
          'pending')
  returning id into v_org;
  insert into organization_members (organization_id, profile_id, is_owner) values (v_org, v_uid, true);
  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (v_uid, 'organization.request', 'organizations', v_org, jsonb_build_object('kind', v_kind));
  return v_org;
end $$;

-- A decisão do admin sobre a organização passa a guardar o motivo (mostrado ao
-- profissional em recusa/suspensão). Mesmas regras de 0005.
create or replace function admin_review_organization(p_org uuid, p_decision text, p_note text default null)
  returns review_status
  language plpgsql security definer set search_path = public as $$
declare
  v_old review_status;
  v_new review_status;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if public.vp_uid() is null or not is_admin() then raise exception 'not allowed'; end if;
  select status into v_old from organizations where id = p_org for update;
  if v_old is null then raise exception 'organization not found'; end if;
  v_new := case
    when p_decision = 'approve' and v_old in ('pending', 'rejected', 'suspended') then 'approved'
    when p_decision = 'reject'  and v_old = 'pending'  then 'rejected'
    when p_decision = 'suspend' and v_old = 'approved' then 'suspended'
  end::review_status;
  if v_new is null then raise exception 'invalid transition'; end if;
  if p_decision in ('reject', 'suspend') and (v_note is null or length(v_note) < 5) then raise exception 'note required'; end if;
  if length(v_note) > 1000 then raise exception 'note too long'; end if;
  update organizations set status = v_new, reviewed_by = public.vp_uid(), reviewed_at = now(), review_note = v_note where id = p_org;
  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (public.vp_uid(), 'organization.review.' || p_decision, 'organizations', p_org,
          jsonb_build_object('from', v_old, 'to', v_new, 'note', v_note));
  -- aviso ao(s) dono(s) da organização (fila)
  insert into notification_outbox (profile_id, channel, template, payload)
  select m.profile_id, 'email', 'organization_' || v_new::text, jsonb_build_object('organization_id', p_org, 'note', v_note)
    from organization_members m where m.organization_id = p_org and m.is_owner;
  return v_new;
end $$;

-- Ajuste dos limites pelo admin (com auditoria).
create or replace function admin_update_portal_settings(p_views int, p_interests int, p_expiry int) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if public.vp_uid() is null or not is_admin() then raise exception 'not allowed'; end if;
  update portal_settings set profile_views_per_day = p_views, interests_per_month = p_interests,
         interest_expiry_days = p_expiry, updated_at = now(), updated_by = public.vp_uid();
  insert into audit_log (actor_id, action, entity, meta)
  values (public.vp_uid(), 'portal.settings', 'portal_settings',
          jsonb_build_object('views', p_views, 'interests', p_interests, 'expiry', p_expiry));
end $$;

-- ---------------------------------------------------------------- permissões das funções
revoke execute on function pro_display_name(text, text, date) from public, anonymous;
revoke execute on function my_pro_org() from public, anonymous;
revoke execute on function interest_status(contact_status, timestamptz) from public, anonymous;
revoke execute on function pro_cards(uuid[]) from public, anonymous, authenticated;
revoke execute on function pro_search_athletes(jsonb, int) from public, anonymous;
revoke execute on function pro_saved_athletes(uuid) from public, anonymous;
revoke execute on function pro_athlete_profile(uuid) from public, anonymous;
revoke execute on function pro_account() from public, anonymous;
revoke execute on function pro_send_interest(uuid, text) from public, anonymous;
revoke execute on function pro_my_interests() from public, anonymous;
revoke execute on function guardian_interests() from public, anonymous;
revoke execute on function respond_interest(uuid, text, text) from public, anonymous;
revoke execute on function complete_professional_signup(text, text, text, text[], text, jsonb, text, text) from public, anonymous;
revoke execute on function admin_update_portal_settings(int, int, int) from public, anonymous;
grant execute on function pro_display_name(text, text, date), my_pro_org(), interest_status(contact_status, timestamptz),
  pro_search_athletes(jsonb, int), pro_saved_athletes(uuid), pro_athlete_profile(uuid), pro_account(),
  pro_send_interest(uuid, text), pro_my_interests(), guardian_interests(), respond_interest(uuid, text, text),
  complete_professional_signup(text, text, text, text[], text, jsonb, text, text),
  admin_update_portal_settings(int, int, int) to authenticated;
