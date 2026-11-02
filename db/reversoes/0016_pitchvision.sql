-- Reversão da migration 0016_pitchvision.sql (NÃO é aplicada automaticamente).
-- Desfaz só o que a 0016 criou. Uso (somente com autorização): no branch certo, numa transação, depois de
-- apagar do Blob os arquivos de analysis_videos. Pedidos e relatórios da PitchVision são APAGADOS
-- (o pedido do Gemini volta a exigir mídia do YouTube; linhas da PitchVision não satisfariam essa regra).
begin;
drop trigger if exists ai_analysis_requests_gemini_minors on ai_analysis_requests;
drop trigger if exists ai_analysis_jobs_gemini_guard on ai_analysis_jobs;
drop function if exists guard_gemini_minors();
drop function if exists guard_gemini_jobs();
drop function if exists pv_register_event(text, text);
drop function if exists pv_save_report(text, text, numeric, ai_confidence, text, text[], text[], text, jsonb);
drop function if exists pv_set_stage(text, text, ai_analysis_status, text);
drop function if exists pv_link_request(uuid, text, text, text);
drop function if exists pv_requests_to_send(int);
drop function if exists request_pitchvision_analysis(uuid, int, text, football_position, text, text, text);
drop function if exists delete_analysis_video(uuid);
drop function if exists register_analysis_video(uuid, text, text, bigint, int, video_type);
drop table if exists pitchvision_events;
delete from ai_video_reports where provider = 'pitchvision';
delete from ai_analysis_requests where provider = 'pitchvision';
alter table ai_video_reports drop constraint if exists ai_reports_provider_source,
  drop column if exists analysis_video_id, drop column if exists provider, alter column media_id set not null;
drop index if exists ai_requests_pv_request;
alter table ai_analysis_requests drop constraint if exists ai_requests_provider_source,
  drop column if exists pv_stage, drop column if exists pv_request_id, drop column if exists pv_match_id,
  drop column if exists analysis_video_id, drop column if exists provider,
  alter column media_id set not null, alter column youtube_id set not null;
alter table ai_settings drop column if exists pitchvision_enabled;
drop table if exists analysis_videos;
delete from vp_meta.migrations where arquivo = '0016_pitchvision.sql';
commit;
