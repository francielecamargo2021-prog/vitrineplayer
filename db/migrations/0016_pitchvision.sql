-- =============================================================================
-- VITRINEPLAYER — Avaliação pela PitchVision (motor próprio de visão computacional), 11/2026.
-- Só ADICIONA estruturas e regras; nada aplicado antes é reescrito.
--
--  1. Vídeo enviado como ARQUIVO (Vercel Blob privado), não link: tabela analysis_videos.
--     O YouTube não pode ser baixado; a PitchVision recebe só uma URL assinada e temporária.
--  2. Provedor do pedido: 'gemini' (fluxo 0004, inalterado) ou 'pitchvision'.
--  3. GEMINI BLOQUEADO PARA MENORES DE 18 (termos da API do Gemini: 18+ e proibição de serviços
--     voltados a menores). Vale para pedidos novos e para itens enviados ao lote do Gemini.
--  4. A regra 0015 (6 a 10 anos sem análise por IA) CONTINUA valendo para os dois provedores,
--     até a revisão de privacidade.
--  5. Referências da PitchVision (partida e pedido) e etapa atual, para acompanhar os jobs.
--  6. Eventos recebidos da PitchVision com chave única (idempotência do webhook).
--  7. Relatório da PitchVision no mesmo ai_video_reports (publicação, exclusão e RLS de 0004),
--     sem nota geral nem notas por fundamento (overall_score nulo; nenhuma linha em ai_report_scores).
--  8. Beta sem cobrança, com a arquitetura de pagamento preservada: mesma regra de 0009 — com crédito
--     (incluídas + concedidas − consumidas) o pedido entra na fila; compras futuras viram crédito
--     (ai_analysis_grants / payments). ai_settings.pitchvision_enabled é a chave geral (padrão: desligada).
-- Reversão: db/reversoes/0016_pitchvision.sql.
-- =============================================================================

-- ---------------------------------------------------------------- 1. vídeos para análise (arquivo)
create table analysis_videos (
  id              uuid primary key default gen_random_uuid(),
  athlete_id      uuid not null references athletes (id) on delete cascade,
  uploaded_by     uuid not null references profiles (id),
  blob_pathname   text not null unique check (blob_pathname ~ '^analises/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,200}$'),
  content_type    text not null check (content_type in ('video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska')),
  size_bytes      bigint not null check (size_bytes > 0 and size_bytes <= 16106127360),        -- até 15 GiB
  duration_s      int not null check (duration_s between 30 and 7800),                          -- 30 s a 130 min
  video_type      video_type not null check (video_type in ('highlights', 'full_match', 'training')),
  status          text not null default 'uploaded' check (status in ('uploaded', 'deleted')),
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index analysis_videos_athlete on analysis_videos (athlete_id, created_at desc);

alter table analysis_videos enable row level security;
create policy analysis_videos_guardian on analysis_videos for select using (is_my_athlete(athlete_id));
create policy analysis_videos_admin on analysis_videos for all using (is_admin());

-- Registro do arquivo DEPOIS do envio ao Blob (só o responsável vinculado; o servidor conferiu o upload).
create or replace function register_analysis_video(p_athlete uuid, p_pathname text, p_content_type text,
  p_size bigint, p_duration_s int, p_video_type video_type) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_my_athlete(p_athlete) then raise exception 'not allowed'; end if;
  if p_pathname not like 'analises/' || p_athlete::text || '/%' then raise exception 'invalid path'; end if;
  if (select count(*) from analysis_videos where athlete_id = p_athlete and status = 'uploaded') >= 5 then
    raise exception 'too many videos';
  end if;
  insert into analysis_videos (athlete_id, uploaded_by, blob_pathname, content_type, size_bytes, duration_s, video_type)
    values (p_athlete, public.vp_uid(), p_pathname, p_content_type, p_size, p_duration_s, p_video_type)
    returning id into v_id;
  insert into audit_log (actor_id, action, entity, entity_id) values (public.vp_uid(), 'analysis_video.register', 'analysis_videos', v_id);
  return v_id;
end $$;

-- Exclusão pelo responsável (o servidor apaga o arquivo do Blob em seguida).
create or replace function delete_analysis_video(p_video uuid) returns text
  language plpgsql security definer set search_path = public as $$
declare v analysis_videos;
begin
  select * into v from analysis_videos where id = p_video;
  if v.id is null or not is_my_athlete(v.athlete_id) then raise exception 'not allowed'; end if;
  if exists (select 1 from ai_analysis_requests where analysis_video_id = p_video and status in ('queued', 'processing')) then
    raise exception 'video in use';
  end if;
  update analysis_videos set status = 'deleted', deleted_at = now() where id = p_video and status <> 'deleted';
  insert into audit_log (actor_id, action, entity, entity_id) values (public.vp_uid(), 'analysis_video.delete', 'analysis_videos', p_video);
  return v.blob_pathname;
end $$;

-- ---------------------------------------------------------------- 2. provedor e referências
alter table ai_settings
  add column pitchvision_enabled boolean not null default false;   -- chave geral da PitchVision (padrão: desligada)

alter table ai_analysis_requests
  add column provider           text not null default 'gemini' check (provider in ('gemini', 'pitchvision')),
  add column analysis_video_id  uuid references analysis_videos (id) on delete cascade,
  add column pv_match_id        text check (pv_match_id ~ '^[A-Za-z0-9]{1,32}$'),
  add column pv_request_id      text check (pv_request_id ~ '^[A-Za-z0-9]{1,32}$'),
  add column pv_stage           text check (pv_stage ~ '^[a-z_]{1,40}$'),
  alter column media_id drop not null,
  alter column youtube_id drop not null,
  add constraint ai_requests_provider_source check (
    (provider = 'gemini' and media_id is not null and youtube_id is not null and analysis_video_id is null)
    or (provider = 'pitchvision' and analysis_video_id is not null and media_id is null and youtube_id is null));
create unique index ai_requests_pv_request on ai_analysis_requests (pv_request_id) where pv_request_id is not null;

alter table ai_video_reports
  add column provider           text not null default 'gemini' check (provider in ('gemini', 'pitchvision')),
  add column analysis_video_id  uuid references analysis_videos (id) on delete cascade,
  alter column media_id drop not null,
  add constraint ai_reports_provider_source check (
    (provider = 'gemini' and media_id is not null)
    or (provider = 'pitchvision' and analysis_video_id is not null and overall_score is null));

-- ---------------------------------------------------------------- 3. Gemini bloqueado para menores
create or replace function guard_gemini_minors() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.provider = 'gemini' and exists (
       select 1 from athletes a where a.id = new.athlete_id and (a.birth_date is null or athlete_age(a.birth_date) < 18)) then
    raise exception 'external ai not allowed for minors';
  end if;
  return new;
end $$;
create trigger ai_analysis_requests_gemini_minors before insert or update of provider, athlete_id on ai_analysis_requests
  for each row execute function guard_gemini_minors();

-- Itens de lote (Gemini) só para pedidos do Gemini de atletas adultos — vale também para pedidos antigos.
create or replace function guard_gemini_jobs() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (
       select 1 from ai_analysis_requests r join athletes a on a.id = r.athlete_id
        where r.id = new.request_id and r.provider = 'gemini' and a.birth_date is not null and athlete_age(a.birth_date) >= 18) then
    raise exception 'external ai not allowed for this request';
  end if;
  return new;
end $$;
create trigger ai_analysis_jobs_gemini_guard before insert on ai_analysis_jobs
  for each row execute function guard_gemini_jobs();

-- ---------------------------------------------------------------- 4. pedido PitchVision (único caminho de criação)
-- Mesmas regras de request_ai_analysis (0009): vínculo, consentimento, crédito, um ativo por atleta, limite em
-- 30 dias; com crédito entra direto na fila. A regra 0015 (até 10 anos) continua no gatilho ai_analysis_requests_formative.
create or replace function request_pitchvision_analysis(
  p_video uuid, p_shirt_number int, p_shirt_color text, p_position football_position,
  p_consent_version text, p_rubric_version text, p_prompt_version text
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v analysis_videos; v_athlete athletes; v_consent uuid; v_id uuid; v_settings ai_settings;
begin
  select * into v from analysis_videos where id = p_video;
  if v.id is null or v.status <> 'uploaded' or not is_my_athlete(v.athlete_id) then raise exception 'not allowed'; end if;
  if coalesce(trim(p_consent_version), '') = '' then raise exception 'consent required'; end if;
  if p_shirt_number is null or p_shirt_number not between 0 and 99 then raise exception 'invalid shirt number'; end if;
  select * into v_settings from ai_settings;
  if not v_settings.pitchvision_enabled then raise exception 'analysis disabled'; end if;
  select * into v_athlete from athletes where id = v.athlete_id;
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
    athlete_id, media_id, analysis_video_id, provider, requested_by, consent_id, status, video_type, youtube_id,
    video_minutes, shirt_number, shirt_color, position, category, birth_year, report_locale,
    rubric_version, prompt_version, model, queued_at)
  values (
    v_athlete.id, null, v.id, 'pitchvision', public.vp_uid(), v_consent, 'queued', v.video_type, null,
    greatest(1, least(130, ceil(v.duration_s / 60.0)::int)), p_shirt_number, trim(coalesce(p_shirt_color, '')), p_position,
    v_athlete.category, v_athlete.birth_year,
    case when (select locale from profiles where id = public.vp_uid()) like 'es%' then 'es' else 'pt-BR' end,
    p_rubric_version, p_prompt_version, 'pitchvision',
    now())
  returning id into v_id;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
    values (public.vp_uid(), 'ai_analysis.request', 'ai_analysis_requests', v_id,
            jsonb_build_object('status', 'queued', 'provider', 'pitchvision'));
  return v_id;
end $$;

-- ---------------------------------------------------------------- 5. operações do integrador (somente serviço)
-- Pedidos PitchVision prontos para envio (o servidor cria a partida e o pedido na PitchVision).
create or replace function pv_requests_to_send(p_limit int) returns table (
  request_id uuid, athlete_id uuid, video_id uuid, blob_pathname text, video_type video_type,
  shirt_number smallint, shirt_color text, athlete_position football_position, birth_year smallint, category text)
  language sql security definer set search_path = public as $$
  select r.id, r.athlete_id, v.id, v.blob_pathname, r.video_type, r.shirt_number, r.shirt_color, r.position,
         r.birth_year, r.category
    from ai_analysis_requests r join analysis_videos v on v.id = r.analysis_video_id
   where r.provider = 'pitchvision' and r.status = 'queued' and r.pv_request_id is null and v.status = 'uploaded'
     and is_privileged()
   order by r.queued_at limit greatest(1, least(p_limit, 50))
$$;

-- Liga o pedido à PitchVision (uma única vez) e passa para 'processing'.
create or replace function pv_link_request(p_request uuid, p_match text, p_pv_request text, p_stage text) returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if not is_privileged() then raise exception 'not allowed'; end if;
  update ai_analysis_requests set pv_match_id = p_match, pv_request_id = p_pv_request, pv_stage = p_stage,
         status = 'processing', updated_at = now()
   where id = p_request and provider = 'pitchvision' and status = 'queued' and pv_request_id is null;
  return found;
end $$;

-- Etapa atual (vinda do webhook ou da consulta de reserva). Nunca reabre pedido encerrado.
create or replace function pv_set_stage(p_pv_request text, p_stage text, p_status ai_analysis_status default null,
  p_error text default null) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_privileged() then raise exception 'not allowed'; end if;
  if p_status is not null and p_status not in ('processing', 'failed', 'unidentified') then raise exception 'invalid status'; end if;
  update ai_analysis_requests set pv_stage = p_stage, status = coalesce(p_status, status),
         error = coalesce(left(p_error, 500), error), updated_at = now(),
         completed_at = case when p_status in ('failed', 'unidentified') then now() else completed_at end
   where pv_request_id = p_pv_request and provider = 'pitchvision' and status = 'processing'
   returning id into v_id;
  return v_id;
end $$;

-- Grava o relatório da PitchVision (uma vez) e conclui o pedido. Sem notas.
create or replace function pv_save_report(p_pv_request text, p_position_group text, p_coverage numeric,
  p_confidence ai_confidence, p_summary text, p_strengths text[], p_development text[], p_positioning text,
  p_report jsonb) returns uuid
  language plpgsql security definer set search_path = public as $$
declare q ai_analysis_requests; v_id uuid;
begin
  if not is_privileged() then raise exception 'not allowed'; end if;
  select * into q from ai_analysis_requests where pv_request_id = p_pv_request and provider = 'pitchvision';
  if q.id is null or q.status not in ('processing', 'completed') then return null; end if;
  insert into ai_video_reports (request_id, athlete_id, media_id, analysis_video_id, provider, video_type, position,
    position_group, category, rubric_version, model, overall_score, coverage, confidence, summary, strengths,
    development, positioning_notes, report)
  values (q.id, q.athlete_id, null, q.analysis_video_id, 'pitchvision', q.video_type, q.position, p_position_group,
    q.category, q.rubric_version, 'pitchvision', null, p_coverage, p_confidence, p_summary,
    coalesce(p_strengths, '{}'), coalesce(p_development, '{}'), p_positioning, p_report)
  on conflict (request_id) do nothing
  returning id into v_id;
  update ai_analysis_requests set status = 'completed', pv_stage = 'completed', completed_at = coalesce(completed_at, now()),
         updated_at = now() where id = q.id and status = 'processing';
  return coalesce(v_id, (select id from ai_video_reports where request_id = q.id));
end $$;

-- ---------------------------------------------------------------- 6. eventos recebidos (idempotência)
create table pitchvision_events (
  event_id     text primary key check (event_id ~ '^[A-Za-z0-9]{1,32}$'),
  type         text not null,
  received_at  timestamptz not null default now()
);
alter table pitchvision_events enable row level security;
create policy pitchvision_events_admin on pitchvision_events for select using (is_admin());

-- Registra o evento; devolve false se já foi recebido (o webhook ignora repetições).
create or replace function pv_register_event(p_event text, p_type text) returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if not is_privileged() then raise exception 'not allowed'; end if;
  insert into pitchvision_events (event_id, type) values (p_event, left(p_type, 60)) on conflict do nothing;
  return found;
end $$;

-- ---------------------------------------------------------------- permissões
revoke execute on function guard_gemini_minors(), guard_gemini_jobs() from public, anonymous, authenticated;
revoke execute on function register_analysis_video(uuid, text, text, bigint, int, video_type),
  delete_analysis_video(uuid),
  request_pitchvision_analysis(uuid, int, text, football_position, text, text, text) from public, anonymous;
grant execute on function register_analysis_video(uuid, text, text, bigint, int, video_type),
  delete_analysis_video(uuid),
  request_pitchvision_analysis(uuid, int, text, football_position, text, text, text) to authenticated;
revoke execute on function pv_requests_to_send(int), pv_link_request(uuid, text, text, text),
  pv_set_stage(text, text, ai_analysis_status, text),
  pv_save_report(text, text, numeric, ai_confidence, text, text[], text[], text, jsonb),
  pv_register_event(text, text) from public, anonymous, authenticated;
