-- Testes da 0016 (PitchVision): vídeo como arquivo, pedido pelo provedor PitchVision, Gemini bloqueado para
-- menores, regra de 6 a 10 anos preservada, operações do integrador só pelo serviço e relatório sem notas.
begin;
create extension if not exists pgtap;
select no_plan();

-- [neon] cadastro de teste = usuário no Neon Auth + complete_signup() (como a Server Action)
create temp table vp_test_signup (id uuid, email text, raw_user_meta_data jsonb) on commit drop;
create function pg_temp.vp_signup() returns trigger language plpgsql as $vp$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'); prev text := current_setting('request.jwt.claims', true);
begin
  insert into neon_auth."user" (id, name, email, "emailVerified") values (new.id, coalesce(m->>'full_name', ''), new.email, false);
  if m ? 'whatsapp' or m ? 'consents' or m ? 'country' then
    perform set_config('request.jwt.claims', json_build_object('sub', new.id, 'role', 'authenticated')::text, true);
    perform complete_signup(m->>'whatsapp', m->>'country', m->>'locale',
      array(select jsonb_array_elements_text(coalesce(m->'consents', '[]'))), m->>'consent_version', m->>'consent_ip', m->>'consent_ua');
    perform set_config('request.jwt.claims', coalesce(prev, ''), true);
  end if;
  return new;
end $vp$;
create trigger vp_signup after insert on vp_test_signup for each row execute function pg_temp.vp_signup();

create function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anonymous"}', true);
  execute 'set local role anonymous';
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;

insert into vp_test_signup (id, email, raw_user_meta_data) values
  ('a2000000-0000-0000-0000-00000000000a', 'pv-a@test.dev', '{"full_name":"Resp A"}'),
  ('b2000000-0000-0000-0000-00000000000b', 'pv-b@test.dev', '{"full_name":"Resp B"}');

create temp table ids (k text primary key, id uuid) on commit drop;
grant all on ids to authenticated, anonymous;

select is((select pitchvision_enabled from ai_settings), false, 'PitchVision desligada por padrão');

-- ---------------------------------------------------------------- atletas (A: 15 anos, 10 anos, 11 anos e 20 anos)
select pg_temp.as_user('a2000000-0000-0000-0000-00000000000a');
insert into ids values ('a15', create_athlete('Quinze', 'Q', (current_date - interval '15 years')::date, 'BR'));
insert into ids values ('a10', create_athlete('Dez', 'D', (current_date - interval '10 years')::date, 'BR'));
insert into ids values ('a11', create_athlete('Onze', 'O', (current_date - interval '11 years')::date, 'BR'));
insert into ids values ('a20', create_athlete('Vinte', 'V', (current_date - interval '20 years')::date, 'BR'));
select pg_temp.as_user('b2000000-0000-0000-0000-00000000000b');
insert into ids values ('b14', create_athlete('Catorze', 'C', (current_date - interval '14 years')::date, 'BR'));

-- ---------------------------------------------------------------- vídeo como arquivo: só o responsável, só no caminho do atleta
select pg_temp.as_user('a2000000-0000-0000-0000-00000000000a');
insert into ids select 'v15', register_analysis_video(id, 'analises/' || id || '/jogo.mp4', 'video/mp4', 300000000, 2700, 'full_match') from ids where k = 'a15';
insert into ids select 'v10', register_analysis_video(id, 'analises/' || id || '/jogo.mp4', 'video/mp4', 1000000, 600, 'full_match') from ids where k = 'a10';
insert into ids select 'v11', register_analysis_video(id, 'analises/' || id || '/jogo.mp4', 'video/mp4', 1000000, 600, 'training') from ids where k = 'a11';
select is((select count(*)::int from analysis_videos), 3, 'responsável vê os próprios vídeos');
select throws_ok(format($$ select register_analysis_video(%L, 'analises/' || %L || '/x.mp4', 'video/mp4', 10, 60, 'full_match') $$,
  (select id from ids where k = 'b14'), (select id from ids where k = 'b14')), null, 'not allowed', 'A não registra vídeo de atleta de B');
select throws_ok(format($$ select register_analysis_video(%L, 'analises/' || %L || '/x.mp4', 'video/mp4', 10, 60, 'full_match') $$,
  (select id from ids where k = 'a15'), (select id from ids where k = 'b14')), null, 'invalid path', 'arquivo precisa estar na pasta do próprio atleta');
select throws_ok(format($$ select register_analysis_video(%L, 'analises/' || %L || '/x.mp4', 'video/mp4', 10, 10, 'full_match') $$,
  (select id from ids where k = 'a15'), (select id from ids where k = 'a15')), '23514', null, 'vídeo curto demais é recusado');
select throws_ok(format($$ insert into analysis_videos (athlete_id, uploaded_by, blob_pathname, content_type, size_bytes, duration_s, video_type)
  values (%L, public.vp_uid(), 'analises/' || %L || '/y.mp4', 'video/mp4', 10, 60, 'full_match') $$,
  (select id from ids where k = 'a15'), (select id from ids where k = 'a15')), '42501', null, 'vídeo não é registrado direto na tabela');

select pg_temp.as_user('b2000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from analysis_videos), 0, 'B não vê vídeos de A');

-- ---------------------------------------------------------------- pedido: chave geral, crédito, idade
select pg_temp.as_user('a2000000-0000-0000-0000-00000000000a');
select throws_ok(format($$ select request_pitchvision_analysis(%L, 7, 'azul', 'CM', 'pv-2026-11', 'pitchvision-v2', 'pitchvision-v2') $$,
  (select id from ids where k = 'v15')), null, 'analysis disabled', 'com a PitchVision desligada não há pedido');
select pg_temp.as_service();
update ai_settings set pitchvision_enabled = true;
select pg_temp.as_user('a2000000-0000-0000-0000-00000000000a');
select throws_ok(format($$ select request_pitchvision_analysis(%L, 7, 'azul', 'CM', 'pv-2026-11', 'pitchvision-v2', 'pitchvision-v2') $$,
  (select id from ids where k = 'v15')), null, 'no analyses available', 'sem crédito não há pedido (beta: crédito concedido)');
select throws_ok(format($$ select request_pitchvision_analysis(%L, 7, 'azul', 'CM', '', 'pitchvision-v2', 'pitchvision-v2') $$,
  (select id from ids where k = 'v15')), null, 'consent required', 'sem consentimento não há pedido');
select pg_temp.as_service();
insert into ai_analysis_grants (athlete_id, quantity, reason) select id, 1, 'beta PitchVision' from ids where k in ('a15', 'a10', 'a11', 'a20');
select pg_temp.as_user('a2000000-0000-0000-0000-00000000000a');
insert into ids select 'r15', request_pitchvision_analysis((select id from ids where k = 'v15'), 7, 'azul', 'CM', 'pv-2026-11', 'pitchvision-v2', 'pitchvision-v2');
select is((select status::text || '/' || provider || '/' || video_minutes from ai_analysis_requests where id = (select id from ids where k = 'r15')),
  'queued/pitchvision/45', 'menor de 15 anos: pedido PitchVision na fila (45 min)');
select ok((select media_id is null and youtube_id is null and analysis_video_id is not null from ai_analysis_requests where id = (select id from ids where k = 'r15')),
  'pedido PitchVision aponta o arquivo, não o YouTube');
select is((select count(*)::int from consents where kind = 'ai_video_analysis' and athlete_id = (select id from ids where k = 'a15')), 1, 'consentimento específico registrado');
select throws_ok(format($$ select request_pitchvision_analysis(%L, 7, 'azul', 'CM', 'pv-2026-11', 'r', 'p') $$,
  (select id from ids where k = 'v15')), null, 'request already active', 'um pedido ativo por atleta');
select throws_ok(format($$ select request_pitchvision_analysis(%L, 7, 'azul', 'CM', 'pv-2026-11', 'r', 'p') $$,
  (select id from ids where k = 'v10')), 'P0001', 'formative age', 'regra de 0015 preservada: 10 anos sem análise');
select lives_ok(format($$ select request_pitchvision_analysis(%L, 9, 'azul', 'ST', 'pv-2026-11', 'r', 'p') $$,
  (select id from ids where k = 'v11')), '11 anos: PitchVision permitida (processamento próprio)');

-- ---------------------------------------------------------------- Gemini bloqueado para menores
insert into athlete_media (athlete_id, kind, url, external_id, video_type)
  select id, 'youtube', 'https://www.youtube.com/watch?v=CCCCCCCCCCC', 'CCCCCCCCCCC', 'highlights' from ids where k = 'a20';
insert into athlete_media (athlete_id, kind, url, external_id, video_type)
  select id, 'youtube', 'https://www.youtube.com/watch?v=DDDDDDDDDDD', 'DDDDDDDDDDD', 'highlights' from ids where k = 'a15';
select pg_temp.as_service();
select throws_ok($$ update ai_analysis_requests set provider = 'gemini' where provider = 'pitchvision' $$, null, null,
  'pedido de menor não vira Gemini');
select throws_ok(format($$ insert into ai_analysis_jobs (request_id, kind, start_s, end_s) values (%L, 'analyze', 0, 60) $$,
  (select id from ids where k = 'r15')), 'P0001', 'external ai not allowed for this request', 'pedido PitchVision nunca entra em lote do Gemini');
select pg_temp.as_user('a2000000-0000-0000-0000-00000000000a');
select lives_ok($$ select 1 $$, 'reinício de papel');
select pg_temp.as_service();
update ai_analysis_requests set status = 'cancelled' where id = (select id from ids where k = 'r15');
select pg_temp.as_user('a2000000-0000-0000-0000-00000000000a');
select throws_ok(format($$ select request_ai_analysis(%L, 'highlights', 4, 7, 'azul', 'CM', 'v1', 'r1', 'p1') $$,
  (select id from athlete_media where external_id = 'DDDDDDDDDDD')), 'P0001', 'external ai not allowed for minors', 'Gemini para 15 anos: bloqueado');
select lives_ok(format($$ select request_ai_analysis(%L, 'highlights', 4, 7, 'azul', 'CM', 'v1', 'r1', 'p1') $$,
  (select id from athlete_media where external_id = 'CCCCCCCCCCC')), 'Gemini para adulto: continua possível (fluxo 0004)');
select pg_temp.as_service();
update ai_analysis_requests set status = 'queued' where id = (select id from ids where k = 'r15');

-- ---------------------------------------------------------------- integrador: só serviço, uma vez
select pg_temp.as_user('a2000000-0000-0000-0000-00000000000a');
select throws_ok($$ select * from pv_requests_to_send(10) $$, '42501', null, 'usuário não lê a fila do integrador');
select throws_ok($$ select pv_register_event('abc', 'x') $$, '42501', null, 'usuário não registra eventos');
select pg_temp.as_service();
select is((select count(*)::int from pv_requests_to_send(10)), 2, 'fila do integrador: pedidos PitchVision na fila (15 e 11 anos)');
select is(pv_link_request((select id from ids where k = 'r15'), 'm1', 'r1', 'ingesting'), true, 'pedido ligado à PitchVision');
select is(pv_link_request((select id from ids where k = 'r15'), 'm2', 'r2', 'ingesting'), false, 'ligação acontece uma única vez');
select is((select status::text || '/' || pv_request_id from ai_analysis_requests where id = (select id from ids where k = 'r15')), 'processing/r1', 'em processamento');
select is((select count(*)::int from pv_requests_to_send(10)), 1, 'pedido já enviado sai da fila');
select is(pv_set_stage('r1', 'athlete_pick'), (select id from ids where k = 'r15'), 'etapa atualizada (escolha visual)');
select is(pv_register_event('evt1', 'athlete_request.updated'), true, 'evento novo');
select is(pv_register_event('evt1', 'athlete_request.updated'), false, 'evento repetido é ignorado');

-- ---------------------------------------------------------------- relatório sem notas, com o fluxo de publicação de 0004
select throws_ok($$ insert into ai_video_reports (request_id, athlete_id, analysis_video_id, provider, video_type, position, position_group,
  rubric_version, model, overall_score, coverage, confidence, summary, report)
  select id, athlete_id, analysis_video_id, 'pitchvision', video_type, position, 'cm', 'r', 'pitchvision', 3.0, 0.5, 'low', 's', '{}'
  from ai_analysis_requests where pv_request_id = 'r1' $$, '23514', null, 'relatório PitchVision não aceita nota geral');
insert into ids select 'rep', pv_save_report('r1', 'cm', 0.66, 'medium', 'Atuou pelo meio-campo.', array['Ocupa o corredor direito'], array[]::text[],
  'Meio-direita', '{"validated": {"observed_seconds": 2400}}');
select ok((select id from ids where k = 'rep') is not null, 'relatório gravado');
select is(pv_save_report('r1', 'cm', 0.66, 'medium', 'x', null, null, null, '{}'), (select id from ids where k = 'rep'), 'gravação repetida não duplica');
select is((select status::text from ai_analysis_requests where pv_request_id = 'r1'), 'completed', 'pedido concluído');
select is((select count(*)::int from ai_report_scores), 0, 'sem notas por fundamento');
select is(pv_set_stage('r1', 'failed', 'failed'), null, 'pedido concluído não reabre');

select pg_temp.as_user('a2000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from ai_video_reports where provider = 'pitchvision'), 1, 'responsável vê o relatório');
select lives_ok(format($$ select set_ai_report_published(%L, true) $$, (select id from ids where k = 'rep')), 'responsável publica (fluxo de 0004)');
select pg_temp.as_user('b2000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from ai_video_reports), 0, 'B não vê relatório de A');
select throws_ok(format($$ select delete_analysis_video(%L) $$, (select id from ids where k = 'v15')), null, 'not allowed', 'B não apaga vídeo de A');
select pg_temp.as_user('a2000000-0000-0000-0000-00000000000a');
select lives_ok(format($$ select delete_ai_report(%L) $$, (select id from ids where k = 'rep')), 'responsável exclui o relatório (revoga o consentimento)');
select throws_ok(format($$ select delete_analysis_video(%L) $$, (select id from ids where k = 'v11')), null, 'video in use', 'vídeo em uso não é apagado');
select is(delete_analysis_video((select id from ids where k = 'v15')), 'analises/' || (select id from ids where k = 'a15') || '/jogo.mp4',
  'vídeo apagado devolve o caminho para remover do Blob');

select * from finish();
rollback;
