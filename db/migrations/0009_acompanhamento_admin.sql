-- =============================================================================
-- VITRINEPLAYER — Fase A do PLANO-FUNCIONALIDADES (decisões aprovadas em 21/10/2026)
-- e a base de banco das fases B1, B2, C1, C2 e D1.
--
--  1. IA: a fila não depende mais do pagamento do cadastro (modelo antigo). O pedido
--     entra na fila se houver crédito (incluídas + concedidas − consumidas).
--     Nenhuma análise incluída por enquanto (included_per_athlete = 0).
--     O profissional recebe o relatório publicado só por função (sem ler a tabela).
--     A IA real continua desligada (ai_settings.enabled = false + travas do servidor).
--  2. Avaliação técnica pela rubrica por posição (1–5, relativa à categoria), por
--     qualquer profissional aprovado; sem "mental" e "potencial".
--  3. Notas e avaliações ficam OCULTAS (não apagadas) enquanto o atleta não estiver
--     visível para a organização (bloqueio, pausa, suspensão).
--  4. Funil de acompanhamento por organização e linha do tempo por atleta.
--  5. Admin: situação das denúncias, moderação de mídia, pedido de correção,
--     suspensão de conta, cortesias de IA.
--  6. Equipe da organização: convites por link de uso único, até 5 membros.
-- =============================================================================

-- ---------------------------------------------------------------- 1. IA
alter table ai_settings alter column included_per_athlete set default 0;
update ai_settings set included_per_athlete = 0, updated_at = now();

create or replace function request_ai_analysis(
  p_media uuid, p_video_type video_type, p_video_minutes int,
  p_shirt_number int, p_shirt_color text, p_position football_position,
  p_consent_version text, p_rubric_version text, p_prompt_version text,
  p_range_start_min int default null, p_range_end_min int default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_media athlete_media; v_athlete athletes; v_consent uuid; v_id uuid;
  v_settings ai_settings;
begin
  select * into v_media from athlete_media where id = p_media;
  if v_media.id is null or v_media.kind <> 'youtube' or not is_my_athlete(v_media.athlete_id) then
    raise exception 'not allowed';
  end if;
  if p_video_type not in ('highlights', 'full_match', 'training') then raise exception 'invalid video type'; end if;
  if coalesce(trim(p_consent_version), '') = '' then raise exception 'consent required'; end if;
  select * into v_athlete from athletes where id = v_media.athlete_id;
  select * into v_settings from ai_settings;
  perform 1 from athletes where id = v_athlete.id for update;   -- serializa pedidos do mesmo atleta

  if exists (select 1 from ai_analysis_requests where athlete_id = v_athlete.id
             and status in ('awaiting_payment', 'queued', 'processing')) then
    raise exception 'request already active';
  end if;
  if ai_analysis_allowance(v_athlete.id) <= 0 then raise exception 'no analyses available'; end if;
  if (select count(*) from ai_analysis_requests where athlete_id = v_athlete.id
        and created_at > now() - interval '30 days') >= v_settings.max_requests_per_30d then
    raise exception 'too many requests';
  end if;

  insert into consents (profile_id, athlete_id, kind, version)
    values (public.vp_uid(), v_athlete.id, 'ai_video_analysis'::consent_kind, p_consent_version)
    returning id into v_consent;

  -- com crédito, o pedido entra direto na fila (o processador só envia se a IA estiver ligada)
  insert into ai_analysis_requests (
    athlete_id, media_id, requested_by, consent_id, status, video_type, youtube_id, video_minutes,
    range_start_s, range_end_s, shirt_number, shirt_color, position, category, birth_year, report_locale,
    rubric_version, prompt_version, model, queued_at)
  values (
    v_athlete.id, v_media.id, public.vp_uid(), v_consent, 'queued', p_video_type, v_media.external_id, p_video_minutes,
    p_range_start_min * 60, p_range_end_min * 60, p_shirt_number, trim(p_shirt_color), p_position,
    v_athlete.category, v_athlete.birth_year,
    case when (select locale from profiles where id = public.vp_uid()) like 'es%' then 'es' else 'pt-BR' end,
    p_rubric_version, p_prompt_version, v_settings.model, now())
  returning id into v_id;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
    values (public.vp_uid(), 'ai_analysis.request', 'ai_analysis_requests', v_id, jsonb_build_object('status', 'queued'));
  return v_id;
end $$;

-- relatório publicado: só por função (sem ids internos, modelo ou custo)
drop policy if exists ai_reports_pro on ai_video_reports;
drop policy if exists ai_scores_pro  on ai_report_scores;

create or replace function pro_ai_report(p_athlete uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'position', r.position, 'position_group', r.position_group, 'video_type', r.video_type, 'category', r.category,
    'rubric_version', r.rubric_version, 'overall_score', r.overall_score, 'coverage', r.coverage, 'confidence', r.confidence,
    'summary', r.summary, 'strengths', r.strengths, 'development', r.development,
    'decision_notes', r.decision_notes, 'positioning_notes', r.positioning_notes, 'created_at', r.created_at,
    'youtube', (select m.external_id from athlete_media m where m.id = r.media_id),
    'scores', (select coalesce(jsonb_agg(jsonb_build_object('criterion', s.criterion, 'score', s.score, 'confidence', s.confidence,
                                                           'evidence', s.evidence_count) order by s.criterion), '[]')
                 from ai_report_scores s where s.report_id = r.id))
    from ai_video_reports r
   where r.athlete_id = p_athlete and r.published_at is not null
     and public.vp_uid() is not null and is_sport_pro() and athlete_visible_to_pro(p_athlete)
$$;

-- cortesia de análise (admin), com auditoria
create or replace function admin_ai_grant(p_athlete uuid, p_quantity int, p_reason text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if public.vp_uid() is null or not is_admin() then raise exception 'not allowed'; end if;
  if p_quantity is null or p_quantity not between 1 and 10 then raise exception 'invalid quantity'; end if;
  if v_reason is null or length(v_reason) < 5 then raise exception 'note required'; end if;
  if not exists (select 1 from athletes where id = p_athlete) then raise exception 'athlete not found'; end if;
  insert into ai_analysis_grants (athlete_id, quantity, reason, granted_by)
  values (p_athlete, p_quantity, left(v_reason, 300), public.vp_uid()) returning id into v_id;
  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (public.vp_uid(), 'ai.grant', 'athletes', p_athlete, jsonb_build_object('quantity', p_quantity, 'reason', v_reason));
  return v_id;
end $$;

-- limites da IA ajustáveis pelo admin. Ligar a IA real NÃO é possível por aqui.
create or replace function admin_update_ai_settings(p_daily numeric, p_monthly numeric, p_max_30d int, p_segment int) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if public.vp_uid() is null or not is_admin() then raise exception 'not allowed'; end if;
  if p_daily not between 0 and 1000 or p_monthly not between 0 and 10000 or p_daily > p_monthly
     or p_max_30d not between 1 and 30 or p_segment not between 5 and 60 then
    raise exception 'invalid settings';
  end if;
  update ai_settings set daily_budget_usd = p_daily, monthly_budget_usd = p_monthly,
         max_requests_per_30d = p_max_30d, segment_minutes = p_segment, updated_at = now();
  insert into audit_log (actor_id, action, entity, meta)
  values (public.vp_uid(), 'ai.settings', 'ai_settings',
          jsonb_build_object('daily', p_daily, 'monthly', p_monthly, 'max_30d', p_max_30d, 'segment', p_segment));
end $$;

-- ---------------------------------------------------------------- suspensão de conta (C1)
alter table profiles
  add column suspended_at    timestamptz,
  add column suspension_note text check (length(suspension_note) <= 1000);

-- campos de moderação e o papel só mudam por funções privilegiadas
-- (sem security definer: current_user precisa ser o papel de quem fez a alteração)
create or replace function guard_profile_update() returns trigger
  language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anonymous') and not is_privileged() then
    if new.role is distinct from old.role or new.suspended_at is distinct from old.suspended_at
       or new.suspension_note is distinct from old.suspension_note then
      raise exception 'campo não editável';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on profiles for each row execute function guard_profile_update();

create or replace function account_active(p_profile uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_profile and suspended_at is null)
$$;

-- conta suspensa perde o acesso à família e ao portal (também pela Data API)
create or replace function is_my_athlete(p_athlete uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from athlete_guardians where athlete_id = p_athlete and profile_id = public.vp_uid())
     and account_active(public.vp_uid())
$$;
create or replace function is_approved_pro() returns boolean
  language sql stable security definer set search_path = public as $$
  select auth_role() in ('PROFESSIONAL', 'SCOUT') and exists (select 1 from my_approved_orgs())
     and account_active(public.vp_uid())
$$;

create or replace function admin_set_account_suspended(p_profile uuid, p_suspend boolean, p_note text default null) returns void
  language plpgsql security definer set search_path = public as $$
declare v_note text := nullif(trim(coalesce(p_note, '')), ''); v_role app_role;
begin
  if public.vp_uid() is null or not is_admin() then raise exception 'not allowed'; end if;
  select role into v_role from profiles where id = p_profile;
  if v_role is null then raise exception 'profile not found'; end if;
  if v_role = 'ADMIN' or p_profile = public.vp_uid() then raise exception 'not allowed'; end if;
  if p_suspend and (v_note is null or length(v_note) < 5) then raise exception 'note required'; end if;
  update profiles set suspended_at = case when p_suspend then now() end,
                      suspension_note = case when p_suspend then left(v_note, 1000) end
   where id = p_profile;
  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (public.vp_uid(), case when p_suspend then 'account.suspend' else 'account.reinstate' end, 'profiles', p_profile,
          jsonb_build_object('note', v_note));
end $$;

-- ---------------------------------------------------------------- moderação de mídia e pedido de correção (C1)
create table athlete_correction_requests (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references athletes (id) on delete cascade,
  note         text not null check (length(note) between 5 and 1000),
  created_by   uuid references profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index correction_athlete on athlete_correction_requests (athlete_id, resolved_at);
alter table athlete_correction_requests enable row level security;
create policy correction_guardian on athlete_correction_requests for select using (is_my_athlete(athlete_id));
create policy correction_admin on athlete_correction_requests for all using (is_admin());

create or replace function admin_request_correction(p_athlete uuid, p_note text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if public.vp_uid() is null or not is_admin() then raise exception 'not allowed'; end if;
  if v_note is null or length(v_note) < 5 then raise exception 'note required'; end if;
  if not exists (select 1 from athletes where id = p_athlete) then raise exception 'athlete not found'; end if;
  insert into athlete_correction_requests (athlete_id, note, created_by) values (p_athlete, left(v_note, 1000), public.vp_uid())
  returning id into v_id;
  insert into notification_outbox (profile_id, channel, template, payload)
  select g.profile_id, 'email', 'correction_requested', jsonb_build_object('athlete_id', p_athlete, 'note', v_note)
    from athlete_guardians g where g.athlete_id = p_athlete;
  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (public.vp_uid(), 'athlete.correction', 'athletes', p_athlete, jsonb_build_object('note', v_note));
  return v_id;
end $$;

create or replace function resolve_correction(p_request uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare v_athlete uuid;
begin
  select athlete_id into v_athlete from athlete_correction_requests where id = p_request;
  if v_athlete is null or not (is_my_athlete(v_athlete) or is_admin()) then raise exception 'not allowed'; end if;
  update athlete_correction_requests set resolved_at = now() where id = p_request and resolved_at is null;
end $$;

-- Remove foto/vídeo impróprio. Devolve o endereço do arquivo no Blob (o servidor apaga o arquivo).
create or replace function admin_remove_media(p_media uuid, p_reason text) returns text
  language plpgsql security definer set search_path = public as $$
declare m athlete_media; v_blob text; v_reason text := nullif(trim(coalesce(p_reason, '')), ''); v_next uuid;
begin
  if public.vp_uid() is null or not is_admin() then raise exception 'not allowed'; end if;
  if v_reason is null or length(v_reason) < 5 then raise exception 'note required'; end if;
  select * into m from athlete_media where id = p_media;
  if m.id is null then raise exception 'media not found'; end if;
  delete from athlete_media where id = m.id;
  if m.kind = 'photo' then
    delete from storage.objects where bucket_id = 'athlete-photos' and name = m.storage_path returning blob_url into v_blob;
    if m.is_primary then
      select id into v_next from athlete_media where athlete_id = m.athlete_id and kind = 'photo' order by position, created_at limit 1;
      if v_next is not null then update athlete_media set is_primary = true where id = v_next; end if;
    end if;
  end if;
  insert into notification_outbox (profile_id, channel, template, payload)
  select g.profile_id, 'email', 'media_removed', jsonb_build_object('athlete_id', m.athlete_id, 'kind', m.kind, 'reason', v_reason)
    from athlete_guardians g where g.athlete_id = m.athlete_id;
  insert into athlete_correction_requests (athlete_id, note, created_by)
  values (m.athlete_id, left(case m.kind when 'photo' then 'Foto removida pela equipe: ' else 'Vídeo removido pela equipe: ' end || v_reason, 1000), public.vp_uid());
  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (public.vp_uid(), 'media.remove', 'athletes', m.athlete_id, jsonb_build_object('kind', m.kind, 'reason', v_reason));
  return v_blob;
end $$;

-- ---------------------------------------------------------------- denúncias com situação (C2)
alter table contact_requests
  add column report_status      text check (report_status in ('open', 'reviewing', 'resolved', 'dismissed')),
  add column report_resolution  text check (length(report_resolution) <= 1000),
  add column report_resolved_by uuid references profiles (id) on delete set null,
  add column report_resolved_at timestamptz;
update contact_requests set report_status = 'open' where reported_at is not null and report_status is null;

create or replace function contact_report_open() returns trigger
  language plpgsql set search_path = public as $$
begin
  if new.reported_at is not null and old.reported_at is null and new.report_status is null then
    new.report_status := 'open';
  end if;
  return new;
end $$;
create trigger contact_report_status before update of reported_at on contact_requests
  for each row execute function contact_report_open();

create or replace function admin_resolve_report(p_request uuid, p_status text, p_note text default null, p_suspend_org boolean default false)
  returns text
  language plpgsql security definer set search_path = public as $$
declare r contact_requests; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if public.vp_uid() is null or not is_admin() then raise exception 'not allowed'; end if;
  select * into r from contact_requests where id = p_request for update;
  if r.id is null or r.reported_at is null then raise exception 'report not found'; end if;
  if p_status not in ('reviewing', 'resolved', 'dismissed') then raise exception 'invalid status'; end if;
  if p_status in ('resolved', 'dismissed') and (v_note is null or length(v_note) < 5) then raise exception 'note required'; end if;
  update contact_requests set report_status = p_status, report_resolution = left(v_note, 1000),
         report_resolved_by = public.vp_uid(), report_resolved_at = case when p_status = 'reviewing' then null else now() end
   where id = r.id;
  if p_suspend_org then
    perform admin_review_organization(r.organization_id, 'suspend', coalesce(v_note, 'Suspensa após denúncia'));
  end if;
  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (public.vp_uid(), 'report.' || p_status, 'contact_requests', r.id,
          jsonb_build_object('organization_id', r.organization_id, 'note', v_note, 'suspend_org', p_suspend_org));
  return p_status;
end $$;

-- interesse abusivo: o admin cancela (some da caixa da família como "expirado")
create or replace function admin_cancel_interest(p_request uuid, p_note text) returns void
  language plpgsql security definer set search_path = public as $$
declare v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if public.vp_uid() is null or not is_admin() then raise exception 'not allowed'; end if;
  if v_note is null or length(v_note) < 5 then raise exception 'note required'; end if;
  update contact_requests set status = 'expired', resolved_at = now() where id = p_request and status = 'requested';
  if not found then raise exception 'invalid transition'; end if;
  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (public.vp_uid(), 'interest.cancel', 'contact_requests', p_request, jsonb_build_object('note', v_note));
end $$;

-- ---------------------------------------------------------------- notas e avaliações (B1)
-- notas: só a organização; ocultas enquanto o atleta não estiver visível; só o autor altera/apaga
alter table pro_notes add constraint pro_notes_body check (length(trim(body)) between 1 and 2000),
                      add constraint pro_notes_tags check (cardinality(tags) <= 8);
drop policy if exists notes_org on pro_notes;
create policy notes_read on pro_notes for select
  using (organization_id in (select my_approved_orgs()) and athlete_visible_to_pro(athlete_id));
create policy notes_insert on pro_notes for insert
  with check (organization_id in (select my_approved_orgs()) and author_id = public.vp_uid() and athlete_visible_to_pro(athlete_id));
create policy notes_author_update on pro_notes for update
  using (author_id = public.vp_uid() and organization_id in (select my_approved_orgs()) and athlete_visible_to_pro(athlete_id))
  with check (author_id = public.vp_uid() and organization_id in (select my_approved_orgs()));
create policy notes_author_delete on pro_notes for delete
  using (author_id = public.vp_uid() and organization_id in (select my_approved_orgs()));

-- avaliação técnica pela rubrica por posição (1–5). Colunas 0–10 antigas ficam sem uso.
alter table scout_evaluations
  add column rubric_version text,
  add column position_group text check (position_group in ('gk', 'cb', 'fb', 'dm', 'mid', 'wing', 'st')),
  add column scores         jsonb,
  add column media_id       uuid references athlete_media (id) on delete set null,
  add column video_minute   smallint check (video_minute between 0 and 200),
  add column context        text check (context in ('video', 'live', 'training', 'other'));

create or replace function evaluation_scores_valid(p jsonb) returns boolean
  language sql immutable as $$
  select p is not null and jsonb_typeof(p) = 'object'
     and (select count(*) from jsonb_each(p)) between 1 and 12
     and not exists (select 1 from jsonb_each(p) e
                      where e.key !~ '^[a-z_]{3,40}$' or jsonb_typeof(e.value) <> 'number'
                         or (e.value::text)::numeric not in (1, 2, 3, 4, 5))
$$;
alter table scout_evaluations
  add constraint evaluations_rubric check (scores is null or (evaluation_scores_valid(scores) and rubric_version is not null and position_group is not null)),
  add constraint evaluations_observation check (observation is null or length(observation) <= 2000);

drop policy if exists evals_org_read on scout_evaluations;
drop policy if exists evals_scout_write on scout_evaluations;
create policy evals_read on scout_evaluations for select
  using (is_admin() or (organization_id in (select my_approved_orgs()) and athlete_visible_to_pro(athlete_id)));
create policy evals_insert on scout_evaluations for insert
  with check (is_approved_pro() and author_id = public.vp_uid() and organization_id in (select my_approved_orgs())
              and athlete_visible_to_pro(athlete_id) and scores is not null);
create policy evals_author_delete on scout_evaluations for delete
  using (author_id = public.vp_uid() and organization_id in (select my_approved_orgs()));
-- vídeo citado tem de ser do próprio atleta
create or replace function guard_evaluation_media() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.media_id is not null and not exists (select 1 from athlete_media where id = new.media_id and athlete_id = new.athlete_id) then
    raise exception 'invalid media';
  end if;
  return new;
end $$;
create trigger scout_evaluations_media before insert or update on scout_evaluations
  for each row execute function guard_evaluation_media();

-- ---------------------------------------------------------------- funil de acompanhamento (B1)
create table pro_tracking (
  organization_id uuid not null references organizations (id) on delete cascade,
  athlete_id      uuid not null references athletes (id) on delete cascade,
  stage           text not null check (stage in ('watching', 'evaluated', 'interest', 'talking', 'archived')),
  updated_by      uuid references profiles (id) on delete set null,
  updated_at      timestamptz not null default now(),
  primary key (organization_id, athlete_id)
);
create index pro_tracking_stage on pro_tracking (organization_id, stage, updated_at desc);
alter table pro_tracking enable row level security;
create policy tracking_org on pro_tracking for all
  using (organization_id in (select my_approved_orgs()) and athlete_visible_to_pro(athlete_id))
  with check (organization_id in (select my_approved_orgs()) and athlete_visible_to_pro(athlete_id) and updated_by = public.vp_uid());

-- Atletas com novidade desde a última visita da organização (vídeo, foto ou dados).
create or replace function pro_updates(p_ids uuid[]) returns setof uuid
  language sql stable security definer set search_path = public as $$
  select a.id from athletes a
   where a.id = any (p_ids) and is_approved_pro() and athlete_visible_to_pro(a.id)
     and exists (select 1 from athlete_views v where v.athlete_id = a.id and v.kind = 'view' and v.organization_id = my_pro_org())
     and greatest(a.updated_at, coalesce((select max(m.created_at) from athlete_media m where m.athlete_id = a.id), a.updated_at))
         > (select max(v.viewed_at) from athlete_views v where v.athlete_id = a.id and v.kind = 'view' and v.organization_id = my_pro_org())
$$;

-- Linha do tempo da organização com o atleta (sem dados da família).
create or replace function pro_athlete_timeline(p_athlete uuid) returns table (at timestamptz, kind text, detail text, author text)
  language sql stable security definer set search_path = public as $$
  with org as (select my_pro_org() as id)
  select x.at, x.kind, x.detail, x.author from (
    select min(v.viewed_at) as at, 'first_view'::text as kind, null::text as detail, null::text as author
      from athlete_views v, org where v.athlete_id = p_athlete and v.kind = 'view' and v.organization_id = org.id having min(v.viewed_at) is not null
    union all
    select n.created_at, 'note', left(n.body, 140), p.full_name from pro_notes n join profiles p on p.id = n.author_id, org
     where n.athlete_id = p_athlete and n.organization_id = org.id
    union all
    select e.created_at, 'evaluation', e.position_group, p.full_name from scout_evaluations e join profiles p on p.id = e.author_id, org
     where e.athlete_id = p_athlete and e.organization_id = org.id and e.scores is not null
    union all
    select i.added_at, 'list', l.name, p.full_name from pro_list_items i join pro_lists l on l.id = i.list_id join profiles p on p.id = i.added_by, org
     where i.athlete_id = p_athlete and l.organization_id = org.id
    union all
    select r.created_at, 'interest_sent', null, p.full_name from contact_requests r join profiles p on p.id = r.requested_by, org
     where r.athlete_id = p_athlete and r.organization_id = org.id
    union all
    select r.resolved_at, 'interest_' || interest_status(r.status, r.created_at), null, null from contact_requests r, org
     where r.athlete_id = p_athlete and r.organization_id = org.id and r.resolved_at is not null
    union all
    select t.updated_at, 'stage', t.stage, p.full_name from pro_tracking t left join profiles p on p.id = t.updated_by, org
     where t.athlete_id = p_athlete and t.organization_id = org.id
  ) x
  where public.vp_uid() is not null and is_approved_pro() and athlete_visible_to_pro(p_athlete)
  order by x.at desc
  limit 200
$$;

-- ---------------------------------------------------------------- equipe da organização (B2)
create table organization_invites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  token_hash      text not null unique,
  created_by      uuid references profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '7 days',
  used_at         timestamptz,
  used_by         uuid references profiles (id) on delete set null,
  revoked_at      timestamptz
);
create index org_invites_org on organization_invites (organization_id);
alter table organization_invites enable row level security;
create policy invites_admin on organization_invites for all using (is_admin());
create policy invites_owner_read on organization_invites for select
  using (organization_id in (select organization_id from organization_members where profile_id = public.vp_uid() and is_owner));

create or replace function org_member_slots(p_org uuid) returns int
  language sql stable security definer set search_path = public as $$
  select 5 - (select count(*)::int from organization_members where organization_id = p_org)
           - (select count(*)::int from organization_invites where organization_id = p_org
                and used_at is null and revoked_at is null and expires_at > now())
$$;

-- Dono da organização aprovada gera um convite de uso único (válido por 7 dias). Devolve o código.
create or replace function org_invite_create() returns text
  language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_token text;
begin
  if public.vp_uid() is null or not is_approved_pro() then raise exception 'not allowed'; end if;
  select m.organization_id into v_org from organization_members m join organizations o on o.id = m.organization_id
   where m.profile_id = public.vp_uid() and m.is_owner and o.status = 'approved' limit 1;
  if v_org is null then raise exception 'not allowed'; end if;
  perform 1 from organizations where id = v_org for update;
  if org_member_slots(v_org) <= 0 then raise exception 'team full'; end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into organization_invites (organization_id, token_hash, created_by)
  values (v_org, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), public.vp_uid());
  insert into audit_log (actor_id, action, entity, entity_id) values (public.vp_uid(), 'organization.invite', 'organizations', v_org);
  return v_token;
end $$;

create or replace function org_invite_revoke(p_invite uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  update organization_invites i set revoked_at = now()
   where i.id = p_invite and i.used_at is null and i.revoked_at is null
     and (is_admin() or i.organization_id in (select organization_id from organization_members where profile_id = public.vp_uid() and is_owner));
  if not found then raise exception 'not allowed'; end if;
end $$;

-- Quem recebeu o link vê só o nome e o tipo da organização antes de aceitar.
create or replace function org_invite_info(p_token text) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', o.name, 'kind', o.kind, 'country', o.country)
    from organization_invites i join organizations o on o.id = i.organization_id
   where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     and i.used_at is null and i.revoked_at is null and i.expires_at > now() and o.status = 'approved'
$$;

-- Conta nova entra na equipe pelo convite (mesmas regras do cadastro profissional).
create or replace function complete_professional_join(
  p_whatsapp text, p_country text, p_locale text, p_consents text[], p_consent_version text,
  p_token text, p_ip text default null, p_ua text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.vp_uid(); v_profile profiles; v_inv organization_invites; v_c text;
  v_country text := upper(coalesce(p_country, ''));
begin
  if v_uid is null then raise exception 'not allowed'; end if;
  select * into v_profile from profiles where id = v_uid for update;
  if v_profile.id is null or v_profile.role <> 'RESPONSIBLE' or exists (select 1 from athlete_guardians where profile_id = v_uid) then
    raise exception 'not allowed';
  end if;
  if exists (select 1 from consents where profile_id = v_uid and athlete_id is null) then raise exception 'signup already completed'; end if;
  select * into v_inv from organization_invites
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') for update;
  if v_inv.id is null or v_inv.used_at is not null or v_inv.revoked_at is not null or v_inv.expires_at <= now()
     or not exists (select 1 from organizations where id = v_inv.organization_id and status = 'approved') then
    raise exception 'invalid invite';
  end if;
  if (select count(*) from organization_members where organization_id = v_inv.organization_id) >= 5 then raise exception 'team full'; end if;
  if v_country !~ '^[A-Z]{2}$' then raise exception 'country'; end if;
  if not (coalesce(p_consents, '{}') @> array['terms', 'privacy', 'pro_conduct']) then raise exception 'consents'; end if;

  update profiles set role = 'PROFESSIONAL', whatsapp = nullif(p_whatsapp, ''), phone = nullif(p_whatsapp, ''), country = v_country,
         locale = case when p_locale in ('pt-BR', 'es') then p_locale else 'pt-BR' end
   where id = v_uid;
  foreach v_c in array p_consents loop
    if v_c in ('terms', 'privacy', 'pro_conduct') then
      insert into consents (profile_id, kind, version, ip, user_agent)
      values (v_uid, v_c::consent_kind, coalesce(p_consent_version, 'unversioned'),
              case when p_ip ~ '^[0-9A-Fa-f:.]{3,45}$' then p_ip::inet end, left(p_ua, 300));
    end if;
  end loop;
  insert into organization_members (organization_id, profile_id, is_owner) values (v_inv.organization_id, v_uid, false);
  update organization_invites set used_at = now(), used_by = v_uid where id = v_inv.id;
  insert into audit_log (actor_id, action, entity, entity_id) values (v_uid, 'organization.join', 'organizations', v_inv.organization_id);
  return v_inv.organization_id;
end $$;

-- Equipe vista pelo dono (nome, e-mail, função) e remoção de membro (dono ou admin).
create or replace function org_team() returns table (profile_id uuid, full_name text, email text, is_owner boolean, joined_at timestamptz)
  language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.email, m.is_owner, p.created_at
    from organization_members m join profiles p on p.id = m.profile_id
   where m.organization_id = my_pro_org() and is_approved_pro()
   order by m.is_owner desc, p.full_name
$$;

create or replace function org_remove_member(p_org uuid, p_profile uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if public.vp_uid() is null then raise exception 'not allowed'; end if;
  if not (is_admin() or exists (select 1 from organization_members where organization_id = p_org and profile_id = public.vp_uid() and is_owner)) then
    raise exception 'not allowed';
  end if;
  if exists (select 1 from organization_members where organization_id = p_org and profile_id = p_profile and is_owner) then
    raise exception 'cannot remove owner';
  end if;
  delete from organization_members where organization_id = p_org and profile_id = p_profile;
  if not found then raise exception 'not found'; end if;
  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (public.vp_uid(), 'organization.remove_member', 'organizations', p_org, jsonb_build_object('profile_id', p_profile));
end $$;

-- ---------------------------------------------------------------- permissões
revoke execute on function pro_ai_report(uuid), admin_ai_grant(uuid, int, text), admin_update_ai_settings(numeric, numeric, int, int),
  account_active(uuid), admin_set_account_suspended(uuid, boolean, text), admin_request_correction(uuid, text), resolve_correction(uuid),
  admin_remove_media(uuid, text), admin_resolve_report(uuid, text, text, boolean), admin_cancel_interest(uuid, text),
  pro_updates(uuid[]), pro_athlete_timeline(uuid), org_member_slots(uuid), org_invite_create(), org_invite_revoke(uuid),
  org_invite_info(text), complete_professional_join(text, text, text, text[], text, text, text, text), org_team(), org_remove_member(uuid, uuid)
  from public, anonymous;
grant execute on function pro_ai_report(uuid), admin_ai_grant(uuid, int, text), admin_update_ai_settings(numeric, numeric, int, int),
  account_active(uuid), admin_set_account_suspended(uuid, boolean, text), admin_request_correction(uuid, text), resolve_correction(uuid),
  admin_remove_media(uuid, text), admin_resolve_report(uuid, text, text, boolean), admin_cancel_interest(uuid, text),
  pro_updates(uuid[]), pro_athlete_timeline(uuid), org_member_slots(uuid), org_invite_create(), org_invite_revoke(uuid),
  org_invite_info(text), complete_professional_join(text, text, text, text[], text, text, text, text), org_team(), org_remove_member(uuid, uuid)
  to authenticated;
revoke execute on function guard_profile_update(), contact_report_open(), guard_evaluation_media() from public, anonymous, authenticated;
