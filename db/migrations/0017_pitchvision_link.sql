-- =============================================================================
-- VITRINEPLAYER — Modo link da PitchVision (link público do YouTube analisado por IA externa), 11/2026.
-- Só ADICIONA estruturas e regras; nada aplicado antes é reescrito (pv_save_report ganha uma coluna nova).
--
--  1. Pedido PitchVision com ORIGEM: 'file' (envio privado, 0016, inalterado) ou 'link' (link público do
--     YouTube; nada é baixado: a PitchVision repassa o link à IA externa, Gemini no plano pago).
--  2. MODO LINK SÓ PARA ATLETAS ADULTOS (18+): gatilho no banco, além da regra no servidor.
--     Termos da API do Gemini: 18+ e proibição de serviços voltados a menores. A regra 0015 continua valendo.
--  3. Chave geral própria (ai_settings.pitchvision_link_enabled, padrão: desligada), além de
--     PITCHVISION_LINK_ENABLED no servidor.
--  4. Certo/errado do responsável por momento do relatório (ai_moment_feedback, com RLS): vira rótulo para medir
--     a precisão real; é repassado à PitchVision.
-- Reversão: db/reversoes/0017_pitchvision_link.sql. NÃO aplicar no Neon sem autorização.
-- =============================================================================

-- ---------------------------------------------------------------- 1. origem do pedido
alter table ai_settings
  add column pitchvision_link_enabled boolean not null default false;   -- modo link (padrão: desligado)

alter table ai_analysis_requests
  add column pv_source        text not null default 'file' check (pv_source in ('file', 'link')),
  add column link_appears_at  text check (link_appears_at ~ '^([0-9]{1,2}:)?[0-9]{1,3}:[0-5][0-9]$'),
  drop constraint ai_requests_provider_source,
  add constraint ai_requests_provider_source check (
    (provider = 'gemini' and pv_source = 'file' and media_id is not null and youtube_id is not null and analysis_video_id is null)
    or (provider = 'pitchvision' and pv_source = 'file' and analysis_video_id is not null and media_id is null and youtube_id is null)
    or (provider = 'pitchvision' and pv_source = 'link' and youtube_id is not null and media_id is null and analysis_video_id is null));

alter table ai_video_reports
  add column pv_source text not null default 'file' check (pv_source in ('file', 'link')),
  drop constraint ai_reports_provider_source,
  add constraint ai_reports_provider_source check (
    (provider = 'gemini' and pv_source = 'file' and media_id is not null)
    or (provider = 'pitchvision' and overall_score is null
        and ((pv_source = 'file' and analysis_video_id is not null) or (pv_source = 'link' and analysis_video_id is null))));

-- ---------------------------------------------------------------- 2. modo link só para adultos (banco)
create or replace function guard_pv_link_adults() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.pv_source = 'link' and (new.provider <> 'pitchvision' or not exists (
       select 1 from athletes a where a.id = new.athlete_id and a.birth_date is not null and athlete_age(a.birth_date) >= 18)) then
    raise exception 'link mode adults only';
  end if;
  return new;
end $$;
create trigger ai_analysis_requests_link_adults before insert or update of pv_source, athlete_id, provider on ai_analysis_requests
  for each row execute function guard_pv_link_adults();

-- ---------------------------------------------------------------- pedido pelo link (único caminho de criação)
-- Mesmas regras de request_pitchvision_analysis (0016): vínculo, consentimento, crédito, um ativo por atleta,
-- limite em 30 dias. Além disso: chave do modo link ligada e atleta adulto.
create or replace function request_pitchvision_link_analysis(
  p_athlete uuid, p_youtube_id text, p_video_minutes int, p_video_type video_type, p_shirt_number int,
  p_shirt_color text, p_position football_position, p_appears_at text,
  p_consent_version text, p_rubric_version text, p_prompt_version text
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_athlete athletes; v_consent uuid; v_id uuid; v_settings ai_settings;
begin
  if not is_my_athlete(p_athlete) then raise exception 'not allowed'; end if;
  if coalesce(trim(p_consent_version), '') = '' then raise exception 'consent required'; end if;
  if p_youtube_id is null or p_youtube_id !~ '^[A-Za-z0-9_-]{11}$' then raise exception 'invalid link'; end if;
  if p_shirt_number is null or p_shirt_number not between 0 and 99 then raise exception 'invalid shirt number'; end if;
  if p_video_minutes is null or p_video_minutes not between 1 and 130 then raise exception 'invalid duration'; end if;
  select * into v_settings from ai_settings;
  if not v_settings.pitchvision_enabled or not v_settings.pitchvision_link_enabled then raise exception 'analysis disabled'; end if;
  select * into v_athlete from athletes where id = p_athlete;
  if v_athlete.birth_date is null or athlete_age(v_athlete.birth_date) < 18 then raise exception 'link mode adults only'; end if;
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

  insert into ai_analysis_requests (
    athlete_id, media_id, analysis_video_id, provider, pv_source, requested_by, consent_id, status, video_type, youtube_id,
    video_minutes, shirt_number, shirt_color, position, category, birth_year, report_locale,
    rubric_version, prompt_version, model, link_appears_at, queued_at)
  values (
    v_athlete.id, null, null, 'pitchvision', 'link', public.vp_uid(), v_consent, 'queued', p_video_type, p_youtube_id,
    p_video_minutes, p_shirt_number, trim(coalesce(p_shirt_color, '')), p_position,
    v_athlete.category, v_athlete.birth_year,
    case when (select locale from profiles where id = public.vp_uid()) like 'es%' then 'es' else 'pt-BR' end,
    p_rubric_version, p_prompt_version, 'pitchvision-link', nullif(trim(coalesce(p_appears_at, '')), ''),
    now())
  returning id into v_id;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
    values (public.vp_uid(), 'ai_analysis.request', 'ai_analysis_requests', v_id,
            jsonb_build_object('status', 'queued', 'provider', 'pitchvision', 'source', 'link'));
  return v_id;
end $$;

-- ---------------------------------------------------------------- operações do integrador (somente serviço)
-- Pedidos pelo link prontos para envio. A idade é conferida de novo aqui (a data de nascimento pode ter mudado).
create or replace function pv_link_requests_to_send(p_limit int) returns table (
  request_id uuid, athlete_id uuid, youtube_id text, video_minutes smallint, shirt_number smallint, shirt_color text,
  athlete_position football_position, appears_at text, category text, adult boolean)
  language sql security definer set search_path = public as $$
  select r.id, r.athlete_id, r.youtube_id, r.video_minutes, r.shirt_number, r.shirt_color, r.position,
         r.link_appears_at, r.category, (a.birth_date is not null and athlete_age(a.birth_date) >= 18)
    from ai_analysis_requests r join athletes a on a.id = r.athlete_id
   where r.provider = 'pitchvision' and r.pv_source = 'link' and r.status = 'queued' and r.pv_request_id is null
     and is_privileged()
   order by r.queued_at limit greatest(1, least(p_limit, 50))
$$;

-- Pedido que a PitchVision recusou antes de existir lá (link privado, menor de idade...): falha sem reabrir.
create or replace function pv_fail_unsent(p_request uuid, p_error text) returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if not is_privileged() then raise exception 'not allowed'; end if;
  update ai_analysis_requests set status = 'failed', pv_stage = 'failed', error = left(p_error, 500),
         completed_at = now(), updated_at = now()
   where id = p_request and provider = 'pitchvision' and status = 'queued' and pv_request_id is null;
  return found;
end $$;

-- Grava o relatório da PitchVision (uma vez) e conclui o pedido. Sem notas. (0016 + origem do pedido)
create or replace function pv_save_report(p_pv_request text, p_position_group text, p_coverage numeric,
  p_confidence ai_confidence, p_summary text, p_strengths text[], p_development text[], p_positioning text,
  p_report jsonb) returns uuid
  language plpgsql security definer set search_path = public as $$
declare q ai_analysis_requests; v_id uuid;
begin
  if not is_privileged() then raise exception 'not allowed'; end if;
  select * into q from ai_analysis_requests where pv_request_id = p_pv_request and provider = 'pitchvision';
  if q.id is null or q.status not in ('processing', 'completed') then return null; end if;
  insert into ai_video_reports (request_id, athlete_id, media_id, analysis_video_id, provider, pv_source, video_type, position,
    position_group, category, rubric_version, model, overall_score, coverage, confidence, summary, strengths,
    development, positioning_notes, report)
  values (q.id, q.athlete_id, null, q.analysis_video_id, 'pitchvision', q.pv_source, q.video_type, q.position, p_position_group,
    q.category, q.rubric_version, q.model, null, p_coverage, p_confidence, p_summary,
    coalesce(p_strengths, '{}'), coalesce(p_development, '{}'), p_positioning, p_report)
  on conflict (request_id) do nothing
  returning id into v_id;
  update ai_analysis_requests set status = 'completed', pv_stage = 'completed', completed_at = coalesce(completed_at, now()),
         updated_at = now() where id = q.id and status = 'processing';
  return coalesce(v_id, (select id from ai_video_reports where request_id = q.id));
end $$;

-- ---------------------------------------------------------------- 4. certo/errado por momento (rótulos)
create table ai_moment_feedback (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references ai_video_reports (id) on delete cascade,
  athlete_id    uuid not null references athletes (id) on delete cascade,
  moment_id     text not null check (moment_id ~ '^[mo][1-9][0-9]{0,3}$'),
  verdict       text not null check (verdict in ('correct', 'incorrect')),
  profile_id    uuid not null references profiles (id),
  pv_synced_at  timestamptz,                                    -- repassado à PitchVision
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (report_id, moment_id)
);
alter table ai_moment_feedback enable row level security;
create policy ai_moment_feedback_guardian on ai_moment_feedback for select using (is_my_athlete(athlete_id));
create policy ai_moment_feedback_admin on ai_moment_feedback for all using (is_admin());

-- Marca certo/errado (só o responsável vinculado, só em relatório do modo link). O último voto vale.
create or replace function pv_link_feedback(p_report uuid, p_moment text, p_verdict text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare r ai_video_reports; v_id uuid;
begin
  select * into r from ai_video_reports where id = p_report;
  if r.id is null or r.provider <> 'pitchvision' or r.pv_source <> 'link' or not is_my_athlete(r.athlete_id) then
    raise exception 'not allowed';
  end if;
  if p_verdict not in ('correct', 'incorrect') then raise exception 'invalid verdict'; end if;
  insert into ai_moment_feedback (report_id, athlete_id, moment_id, verdict, profile_id)
    values (r.id, r.athlete_id, p_moment, p_verdict, public.vp_uid())
  on conflict (report_id, moment_id) do update set verdict = excluded.verdict, profile_id = excluded.profile_id,
    updated_at = now(), pv_synced_at = null
  returning id into v_id;
  return v_id;
end $$;

create or replace function pv_feedback_synced(p_feedback uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_privileged() then raise exception 'not allowed'; end if;
  update ai_moment_feedback set pv_synced_at = now() where id = p_feedback;
end $$;

-- ---------------------------------------------------------------- permissões
revoke execute on function guard_pv_link_adults() from public, anonymous, authenticated;
revoke execute on function request_pitchvision_link_analysis(uuid, text, int, video_type, int, text, football_position, text, text, text, text),
  pv_link_feedback(uuid, text, text) from public, anonymous;
grant execute on function request_pitchvision_link_analysis(uuid, text, int, video_type, int, text, football_position, text, text, text, text),
  pv_link_feedback(uuid, text, text) to authenticated;
revoke execute on function pv_link_requests_to_send(int), pv_fail_unsent(uuid, text), pv_feedback_synced(uuid)
  from public, anonymous, authenticated;
