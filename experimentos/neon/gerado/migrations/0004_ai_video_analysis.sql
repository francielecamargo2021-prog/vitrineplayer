-- =============================================================================
-- VITRINEPLAYER — avaliação técnica por IA (triagem preliminar)
-- Só ADICIONA estruturas: nenhuma tabela, função ou política existente muda.
--
-- Regras centrais (garantidas aqui, no banco):
--  * Só o responsável vinculado pede a avaliação, escolhendo UM vídeo do
--    YouTube já cadastrado do próprio atleta, com consentimento específico.
--  * O pedido só entra na fila de processamento com pagamento confirmado
--    (status 'queued'); antes disso fica 'awaiting_payment'.
--  * Um pedido ativo por atleta; quantidade de avaliações configurável
--    (ai_settings + ai_analysis_grants), sem regra comercial fixa.
--  * O relatório nasce NÃO publicado. Só o responsável publica, despublica ou
--    exclui (excluir também revoga o consentimento da análise).
--  * Profissional só lê relatório publicado de atleta visível para ele
--    (athlete_visible_to_pro: aprovado + ativo + não bloqueado) e apenas como
--    membro de organização esportiva aprovada (marcas nunca).
--  * Fila, lotes, custos e configurações são internos: só service role/admin.
--  * Processamento desligado por padrão (ai_settings.enabled = false).
-- =============================================================================

alter type consent_kind add value if not exists 'ai_video_analysis';

create type ai_analysis_status as enum (
  'awaiting_payment',  -- consentido, aguardando confirmação do pagamento
  'queued',            -- liberado para processamento
  'processing',        -- enviado ao provedor (lote)
  'completed',         -- relatório gerado
  'unidentified',      -- a IA não identificou o atleta com segurança: sem avaliação
  'failed',            -- falhou após as tentativas permitidas
  'cancelled'          -- cancelado pelo responsável (ou vídeo removido)
);
create type ai_job_kind   as enum ('analyze', 'segment', 'consolidate');
create type ai_job_status as enum ('pending', 'submitted', 'succeeded', 'failed', 'cancelled');
create type ai_batch_status as enum ('creating', 'submitted', 'succeeded', 'failed', 'expired', 'cancelled');
create type ai_confidence as enum ('low', 'medium', 'high');

-- ---------------------------------------------------------------- configurações (linha única)
create table ai_settings (
  id                       boolean primary key default true check (id),
  enabled                  boolean not null default false,          -- chave geral: nada é enviado ao provedor sem isto
  model                    text not null default 'gemini-3.8-flash',
  daily_budget_usd         numeric(10, 2) not null default 5,
  monthly_budget_usd       numeric(10, 2) not null default 50,
  max_items_per_batch      int not null default 50 check (max_items_per_batch between 1 and 500),
  max_wait_hours           int not null default 6 check (max_wait_hours between 0 and 72),
  max_attempts             smallint not null default 3 check (max_attempts between 1 and 10),
  segment_minutes          smallint not null default 15 check (segment_minutes between 5 and 60),
  included_per_athlete     smallint not null default 1 check (included_per_athlete >= 0),
  max_requests_per_30d     smallint not null default 3 check (max_requests_per_30d >= 1),
  updated_at               timestamptz not null default now()
);
insert into ai_settings default values;

-- Avaliações adicionais concedidas (cortesia, compra futura). Sem preço fixo aqui.
create table ai_analysis_grants (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references athletes (id) on delete cascade,
  quantity    smallint not null check (quantity > 0),
  reason      text not null,
  granted_by  uuid references profiles (id),
  created_at  timestamptz not null default now()
);
create index ai_analysis_grants_athlete on ai_analysis_grants (athlete_id);

-- ---------------------------------------------------------------- pedidos (um por avaliação)
create table ai_analysis_requests (
  id                  uuid primary key default gen_random_uuid(),
  athlete_id          uuid not null references athletes (id) on delete cascade,
  media_id            uuid not null references athlete_media (id) on delete cascade,
  requested_by        uuid not null references profiles (id),
  consent_id          uuid not null references consents (id),
  status              ai_analysis_status not null default 'awaiting_payment',
  -- fotografia do pedido: o relatório sempre se refere a ESTE vídeo e contexto
  video_type          video_type not null check (video_type in ('highlights', 'full_match', 'training')),
  youtube_id          text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  video_minutes       smallint not null check (video_minutes between 1 and 130),
  range_start_s       int check (range_start_s >= 0),
  range_end_s         int check (range_end_s > 0),
  shirt_number        smallint not null check (shirt_number between 0 and 99),
  shirt_color         text not null check (length(trim(shirt_color)) between 2 and 40),
  position            football_position not null,
  category            text,
  birth_year          smallint,
  report_locale       text not null default 'pt-BR' check (report_locale in ('pt-BR', 'es')),
  rubric_version      text not null,
  prompt_version      text not null,
  model               text not null,
  estimated_cost_usd  numeric(10, 4),
  cost_usd            numeric(10, 4) not null default 0,
  error               text,                      -- interno (nunca exibido como veio)
  queued_at           timestamptz,
  completed_at        timestamptz,
  cancelled_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint ai_requests_range check (range_end_s is null or range_start_s is null or range_end_s > range_start_s),
  constraint ai_requests_range_in_video check (range_end_s is null or range_end_s <= video_minutes * 60)
);
-- no máximo UM pedido em andamento por atleta (evita repetição e gasto indevido);
-- novas avaliações depois de concluída dependem de saldo (ai_analysis_allowance)
create unique index ai_requests_one_active on ai_analysis_requests (athlete_id)
  where status in ('awaiting_payment', 'queued', 'processing');
create index ai_requests_status on ai_analysis_requests (status, queued_at);

-- ---------------------------------------------------------------- lotes enviados ao provedor
create table ai_batches (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null default 'gemini',
  provider_name       text unique,                -- ex.: batches/123 (nulo enquanto 'creating')
  model               text not null,
  status              ai_batch_status not null default 'creating',
  item_count          int not null default 0,
  estimated_cost_usd  numeric(10, 4) not null default 0,
  cost_usd            numeric(10, 4) not null default 0,
  error               text,
  created_at          timestamptz not null default now(),
  submitted_at        timestamptz,
  completed_at        timestamptz
);
create index ai_batches_open on ai_batches (status) where status in ('creating', 'submitted');

-- ---------------------------------------------------------------- itens de trabalho (cada linha do lote)
create table ai_analysis_jobs (
  id                  uuid primary key default gen_random_uuid(),   -- também é a chave da linha no lote
  request_id          uuid not null references ai_analysis_requests (id) on delete cascade,
  kind                ai_job_kind not null,
  seq                 smallint not null default 0,                  -- ordem do trecho
  start_s             int,
  end_s               int,
  status              ai_job_status not null default 'pending',
  batch_id            uuid references ai_batches (id),
  attempts            smallint not null default 0,
  estimated_cost_usd  numeric(10, 4) not null default 0,
  input_tokens        int,
  output_tokens       int,
  cost_usd            numeric(10, 4) not null default 0,
  result              jsonb,                                       -- saída validada (trechos: observações parciais)
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz,
  unique (request_id, kind, seq)
);
create index ai_jobs_pending on ai_analysis_jobs (status, created_at) where status = 'pending';
create index ai_jobs_batch on ai_analysis_jobs (batch_id);

-- ---------------------------------------------------------------- relatórios e notas
create table ai_video_reports (
  id               uuid primary key default gen_random_uuid(),
  request_id       uuid not null unique references ai_analysis_requests (id) on delete cascade,
  athlete_id       uuid not null references athletes (id) on delete cascade,
  media_id         uuid not null references athlete_media (id) on delete cascade,
  video_type       video_type not null,
  position         football_position not null,
  position_group   text not null,
  category         text,
  rubric_version   text not null,
  model            text not null,
  overall_score    numeric(2, 1) check (overall_score between 1 and 5),   -- nulo sem evidência suficiente
  coverage         numeric(3, 2) not null check (coverage between 0 and 1),
  confidence       ai_confidence not null,
  summary          text not null,
  strengths        text[] not null default '{}',
  development      text[] not null default '{}',
  decision_notes   text,
  positioning_notes text,
  report           jsonb not null,                                       -- relatório completo (inclui evidências)
  published_at     timestamptz,
  created_at       timestamptz not null default now()
);
create index ai_reports_athlete on ai_video_reports (athlete_id);
-- no máximo um relatório publicado por atleta (publicar um novo despublica o anterior)
create unique index ai_reports_one_published on ai_video_reports (athlete_id) where published_at is not null;

-- uma linha por fundamento OBSERVADO (sem linha = não observado). Base dos filtros futuros.
create table ai_report_scores (
  report_id       uuid not null references ai_video_reports (id) on delete cascade,
  athlete_id      uuid not null references athletes (id) on delete cascade,
  criterion       text not null check (criterion ~ '^[a-z_]{3,40}$'),
  score           smallint not null check (score between 1 and 5),
  confidence      ai_confidence not null,
  evidence_count  smallint not null check (evidence_count >= 0),
  primary key (report_id, criterion)
);
create index ai_scores_filter on ai_report_scores (criterion, score);

-- ---------------------------------------------------------------- funções de apoio
-- Membro de organização ESPORTIVA aprovada (marcas não têm acesso esportivo).
create or replace function is_sport_pro() returns boolean
  language sql stable security definer set search_path = public as $$
  select is_approved_pro() and exists (
    select 1 from organization_members m join organizations o on o.id = m.organization_id
    where m.profile_id = public.vp_uid() and o.status = 'approved' and o.kind <> 'brand')
$$;

-- Avaliações ainda disponíveis para o atleta (incluídas + concedidas − consumidas).
create or replace function ai_analysis_allowance(p_athlete uuid) returns int
  language sql stable security definer set search_path = public as $$
  select (select included_per_athlete from ai_settings)
       + coalesce((select sum(quantity) from ai_analysis_grants where athlete_id = p_athlete), 0)::int
       - (select count(*) from ai_analysis_requests
           where athlete_id = p_athlete and status in ('awaiting_payment', 'queued', 'processing', 'completed'))::int
$$;

-- Pedido de avaliação pelo responsável (único caminho de criação).
create or replace function request_ai_analysis(
  p_media uuid, p_video_type video_type, p_video_minutes int,
  p_shirt_number int, p_shirt_color text, p_position football_position,
  p_consent_version text, p_rubric_version text, p_prompt_version text,
  p_range_start_min int default null, p_range_end_min int default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_media athlete_media; v_athlete athletes; v_consent uuid; v_id uuid; v_status ai_analysis_status;
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

  v_status := case when exists (select 1 from payments where athlete_id = v_athlete.id and status = 'paid')
                   then 'queued' else 'awaiting_payment' end;

  insert into ai_analysis_requests (
    athlete_id, media_id, requested_by, consent_id, status, video_type, youtube_id, video_minutes,
    range_start_s, range_end_s, shirt_number, shirt_color, position, category, birth_year, report_locale,
    rubric_version, prompt_version, model, queued_at)
  values (
    v_athlete.id, v_media.id, public.vp_uid(), v_consent, v_status, p_video_type, v_media.external_id, p_video_minutes,
    p_range_start_min * 60, p_range_end_min * 60, p_shirt_number, trim(p_shirt_color), p_position,
    v_athlete.category, v_athlete.birth_year,
    case when (select locale from profiles where id = public.vp_uid()) like 'es%' then 'es' else 'pt-BR' end,
    p_rubric_version, p_prompt_version, v_settings.model,
    case when v_status = 'queued' then now() end)
  returning id into v_id;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
    values (public.vp_uid(), 'ai_analysis.request', 'ai_analysis_requests', v_id, jsonb_build_object('status', v_status));
  return v_id;
end $$;

-- Cancelamento pelo responsável (antes de concluir). Resultados que chegarem depois são descartados.
create or replace function cancel_ai_analysis(p_request uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare v_athlete uuid;
begin
  select athlete_id into v_athlete from ai_analysis_requests where id = p_request;
  if v_athlete is null or not is_my_athlete(v_athlete) then raise exception 'not allowed'; end if;
  update ai_analysis_requests set status = 'cancelled', cancelled_at = now(), updated_at = now()
    where id = p_request and status in ('awaiting_payment', 'queued', 'processing');
  if not found then raise exception 'not cancellable'; end if;
  update ai_analysis_jobs set status = 'cancelled', updated_at = now()
    where request_id = p_request and status = 'pending';
  insert into audit_log (actor_id, action, entity, entity_id) values (public.vp_uid(), 'ai_analysis.cancel', 'ai_analysis_requests', p_request);
end $$;

-- Publicar / despublicar na vitrine (só o responsável vinculado).
create or replace function set_ai_report_published(p_report uuid, p_published boolean) returns void
  language plpgsql security definer set search_path = public as $$
declare v_athlete uuid;
begin
  select athlete_id into v_athlete from ai_video_reports where id = p_report;
  if v_athlete is null or not is_my_athlete(v_athlete) then raise exception 'not allowed'; end if;
  if p_published then
    update ai_video_reports set published_at = null where athlete_id = v_athlete and id <> p_report and published_at is not null;
  end if;
  update ai_video_reports set published_at = case when p_published then coalesce(published_at, now()) end where id = p_report;
  insert into audit_log (actor_id, action, entity, entity_id)
    values (public.vp_uid(), case when p_published then 'ai_report.publish' else 'ai_report.unpublish' end, 'ai_video_reports', p_report);
end $$;

-- Excluir o relatório e revogar o consentimento da análise. O pedido continua
-- 'completed' (consumido): excluir não libera uma nova avaliação incluída.
create or replace function delete_ai_report(p_report uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare v_athlete uuid; v_request uuid; v_consent uuid;
begin
  select r.athlete_id, r.request_id, q.consent_id into v_athlete, v_request, v_consent
    from ai_video_reports r join ai_analysis_requests q on q.id = r.request_id where r.id = p_report;
  if v_athlete is null or not is_my_athlete(v_athlete) then raise exception 'not allowed'; end if;
  delete from ai_video_reports where id = p_report;
  update consents set revoked_at = now() where id = v_consent and revoked_at is null;
  update ai_analysis_jobs set result = null where request_id = v_request;   -- apaga observações intermediárias
  insert into audit_log (actor_id, action, entity, entity_id) values (public.vp_uid(), 'ai_report.delete', 'ai_video_reports', p_report);
end $$;

-- Pagamento confirmado → pedidos aguardando entram na fila.
create or replace function ai_release_after_payment() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    update ai_analysis_requests set status = 'queued', queued_at = now(), updated_at = now()
      where athlete_id = new.athlete_id and status = 'awaiting_payment';
  end if;
  return new;
end $$;
create trigger payments_release_ai after update of status on payments
  for each row execute function ai_release_after_payment();

-- Vídeo removido pelo responsável: pedido, itens e relatório saem em cascata;
-- um resultado de lote que chegue depois não encontra o item e é descartado.
revoke execute on function ai_analysis_allowance(uuid) from anonymous;

-- ---------------------------------------------------------------- operações do processador (somente service role)
-- Reserva itens pendentes para um lote (+1 tentativa). Itens já reservados por outro ciclo ficam de fora.
create or replace function ai_claim_jobs(p_ids uuid[], p_batch uuid) returns setof uuid
  language sql security definer set search_path = public as $$
  update ai_analysis_jobs j set status = 'submitted', batch_id = p_batch, attempts = j.attempts + 1, updated_at = now()
  from ai_analysis_requests r
  where j.id = any (p_ids) and j.status = 'pending' and r.id = j.request_id and r.status in ('queued', 'processing')
  returning j.id
$$;

-- Devolve itens enviados: nova tentativa (pendente) ou falha definitiva (tentativas esgotadas).
create or replace function ai_release_jobs(p_ids uuid[], p_error text, p_max_attempts int)
  returns table (job_id uuid, request_id uuid, failed boolean)
  language sql security definer set search_path = public as $$
  update ai_analysis_jobs set
    status = case when attempts >= p_max_attempts then 'failed' else 'pending' end::ai_job_status,
    batch_id = case when attempts >= p_max_attempts then batch_id end,
    error = left(p_error, 500), updated_at = now()
  where id = any (p_ids) and status = 'submitted'
  returning id, request_id, attempts >= p_max_attempts
$$;

-- Conclui um item UMA vez (enviado + mesmo lote) e acumula o custo no pedido e no lote.
create or replace function ai_complete_job(p_job uuid, p_batch uuid, p_result jsonb, p_input int, p_output int, p_cost numeric)
  returns boolean
  language plpgsql security definer set search_path = public as $$
declare v_request uuid;
begin
  update ai_analysis_jobs set status = 'succeeded', result = p_result, input_tokens = coalesce(input_tokens, 0) + p_input,
         output_tokens = coalesce(output_tokens, 0) + p_output, cost_usd = cost_usd + p_cost, completed_at = now(), updated_at = now()
   where id = p_job and status = 'submitted' and batch_id = p_batch
   returning request_id into v_request;
  if v_request is null then return false; end if;
  update ai_analysis_requests set cost_usd = cost_usd + p_cost, updated_at = now() where id = v_request;
  update ai_batches set cost_usd = cost_usd + p_cost where id = p_batch;
  return true;
end $$;

-- Custo de uma resposta inutilizável (os tokens foram cobrados mesmo assim).
create or replace function ai_add_job_cost(p_job uuid, p_batch uuid, p_input int, p_output int, p_cost numeric) returns void
  language plpgsql security definer set search_path = public as $$
declare v_request uuid;
begin
  update ai_analysis_jobs set input_tokens = coalesce(input_tokens, 0) + p_input, output_tokens = coalesce(output_tokens, 0) + p_output,
         cost_usd = cost_usd + p_cost, updated_at = now()
   where id = p_job and batch_id = p_batch returning request_id into v_request;
  if v_request is null then return; end if;
  update ai_analysis_requests set cost_usd = cost_usd + p_cost, updated_at = now() where id = v_request;
  update ai_batches set cost_usd = cost_usd + p_cost where id = p_batch;
end $$;

-- Gasto desde uma data: custo real dos itens + estimativa dos itens ainda em processamento.
create or replace function ai_spent_since(p_since timestamptz) returns numeric
  language sql stable security definer set search_path = public as $$
  select coalesce((select sum(cost_usd) from ai_analysis_jobs where updated_at >= p_since and cost_usd > 0), 0)
       + coalesce((select sum(estimated_cost_usd) from ai_analysis_jobs where status = 'submitted' and cost_usd = 0), 0)
$$;

-- Muda o status de um pedido em andamento (nunca sobrescreve cancelado/concluído).
create or replace function ai_set_request_status(p_request uuid, p_status ai_analysis_status, p_error text default null) returns void
  language sql security definer set search_path = public as $$
  update ai_analysis_requests set status = p_status, error = coalesce(left(p_error, 500), error), updated_at = now(),
         completed_at = case when p_status in ('completed', 'unidentified', 'failed') then now() else completed_at end
  where id = p_request and status in ('queued', 'processing')
$$;

revoke execute on function ai_claim_jobs(uuid[], uuid), ai_release_jobs(uuid[], text, int),
  ai_complete_job(uuid, uuid, jsonb, int, int, numeric), ai_add_job_cost(uuid, uuid, int, int, numeric),
  ai_spent_since(timestamptz), ai_set_request_status(uuid, ai_analysis_status, text)
  from public, anonymous, authenticated;

-- ---------------------------------------------------------------- RLS
alter table ai_settings          enable row level security;
alter table ai_analysis_grants   enable row level security;
alter table ai_analysis_requests enable row level security;
alter table ai_batches           enable row level security;
alter table ai_analysis_jobs     enable row level security;
alter table ai_video_reports     enable row level security;
alter table ai_report_scores     enable row level security;

-- internos: somente admin (service role ignora RLS)
create policy ai_settings_admin on ai_settings          for all using (is_admin());
create policy ai_grants_admin   on ai_analysis_grants   for all using (is_admin());
create policy ai_batches_admin  on ai_batches           for all using (is_admin());
create policy ai_jobs_admin     on ai_analysis_jobs     for all using (is_admin());

-- pedidos: responsável vinculado lê (criação/cancelamento só pelas funções)
create policy ai_requests_guardian on ai_analysis_requests for select using (is_my_athlete(athlete_id));
create policy ai_requests_admin    on ai_analysis_requests for all using (is_admin());

-- relatórios: responsável sempre; profissional esportivo só publicado + atleta visível
create policy ai_reports_guardian on ai_video_reports for select using (is_my_athlete(athlete_id));
create policy ai_reports_pro on ai_video_reports for select
  using (published_at is not null and is_sport_pro() and athlete_visible_to_pro(athlete_id));
create policy ai_reports_admin on ai_video_reports for all using (is_admin());

create policy ai_scores_guardian on ai_report_scores for select using (is_my_athlete(athlete_id));
create policy ai_scores_pro on ai_report_scores for select
  using (is_sport_pro() and athlete_visible_to_pro(athlete_id)
         and exists (select 1 from ai_video_reports r where r.id = report_id and r.published_at is not null));
create policy ai_scores_admin on ai_report_scores for all using (is_admin());
