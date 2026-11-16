-- Reversão da migration 0017_pitchvision_link.sql (NÃO é aplicada automaticamente).
-- Desfaz só o que a 0017 criou. Uso (somente com autorização): numa transação. Pedidos e relatórios do MODO LINK
-- são APAGADOS (não satisfariam as regras da 0016) e os certo/errado também; pv_save_report volta à versão da 0016.
begin;
drop trigger if exists ai_analysis_requests_link_adults on ai_analysis_requests;
drop function if exists guard_pv_link_adults();
drop function if exists pv_feedback_synced(uuid);
drop function if exists pv_link_feedback(uuid, text, text);
drop table if exists ai_moment_feedback;
drop function if exists pv_fail_unsent(uuid, text);
drop function if exists pv_link_requests_to_send(int);
drop function if exists request_pitchvision_link_analysis(uuid, text, int, video_type, int, text, football_position, text, text, text, text);
delete from ai_video_reports where pv_source = 'link';
delete from ai_analysis_requests where pv_source = 'link';
alter table ai_video_reports drop constraint if exists ai_reports_provider_source, drop column if exists pv_source,
  add constraint ai_reports_provider_source check (
    (provider = 'gemini' and media_id is not null)
    or (provider = 'pitchvision' and analysis_video_id is not null and overall_score is null));
alter table ai_analysis_requests drop constraint if exists ai_requests_provider_source,
  drop column if exists link_appears_at, drop column if exists pv_source,
  add constraint ai_requests_provider_source check (
    (provider = 'gemini' and media_id is not null and youtube_id is not null and analysis_video_id is null)
    or (provider = 'pitchvision' and analysis_video_id is not null and media_id is null and youtube_id is null));
alter table ai_settings drop column if exists pitchvision_link_enabled;
-- pv_save_report: versão da 0016
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
delete from vp_meta.migrations where arquivo = '0017_pitchvision_link.sql';
commit;
