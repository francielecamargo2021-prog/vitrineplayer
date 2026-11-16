-- Testes da 0017 (modo link da PitchVision): só adultos (banco), chave própria desligada por padrão, origem do
-- pedido, fila do integrador só pelo serviço, relatório sem nota e certo/errado com RLS.
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
  ('a3000000-0000-0000-0000-00000000000a', 'pvl-a@test.dev', '{"full_name":"Resp A"}'),
  ('b3000000-0000-0000-0000-00000000000b', 'pvl-b@test.dev', '{"full_name":"Resp B"}');

create temp table ids (k text primary key, id uuid) on commit drop;
grant all on ids to authenticated, anonymous;

select is((select pitchvision_link_enabled from ai_settings), false, 'modo link desligado por padrão');

-- ---------------------------------------------------------------- atletas (A: 17, 18 e 21 anos; B: 20 anos)
select pg_temp.as_user('a3000000-0000-0000-0000-00000000000a');
insert into ids values ('a17', create_athlete('Dezessete', 'D', (current_date - interval '17 years')::date, 'BR'));
insert into ids values ('a18', create_athlete('Dezoito', 'E', (current_date - interval '18 years')::date, 'BR'));
insert into ids values ('a21', create_athlete('Vinte e um', 'T', (current_date - interval '21 years')::date, 'BR'));
select pg_temp.as_user('b3000000-0000-0000-0000-00000000000b');
insert into ids values ('b20', create_athlete('Vinte', 'V', (current_date - interval '20 years')::date, 'BR'));

-- ---------------------------------------------------------------- chaves gerais
select pg_temp.as_user('a3000000-0000-0000-0000-00000000000a');
select throws_ok(format($$ select request_pitchvision_link_analysis(%L, 'AbCdEfGhIj0', 90, 'full_match', 10, 'azul', 'CM', '03:12', 'pvl-2026-11', 'r', 'p') $$,
  (select id from ids where k = 'a21')), null, 'analysis disabled', 'com o modo link desligado não há pedido');
select pg_temp.as_service();
update ai_settings set pitchvision_enabled = true;
select pg_temp.as_user('a3000000-0000-0000-0000-00000000000a');
select throws_ok(format($$ select request_pitchvision_link_analysis(%L, 'AbCdEfGhIj0', 90, 'full_match', 10, 'azul', 'CM', '03:12', 'pvl-2026-11', 'r', 'p') $$,
  (select id from ids where k = 'a21')), null, 'analysis disabled', 'PitchVision ligada mas modo link desligado: sem pedido');
select pg_temp.as_service();
update ai_settings set pitchvision_link_enabled = true;
insert into ai_analysis_grants (athlete_id, quantity, reason) select id, 2, 'beta modo link' from ids where k in ('a17', 'a18', 'a21', 'b20');

-- ---------------------------------------------------------------- só adultos (função e gatilho)
select pg_temp.as_user('a3000000-0000-0000-0000-00000000000a');
select throws_ok(format($$ select request_pitchvision_link_analysis(%L, 'AbCdEfGhIj0', 90, 'full_match', 10, 'azul', 'CM', '03:12', 'pvl-2026-11', 'r', 'p') $$,
  (select id from ids where k = 'a17')), null, 'link mode adults only', '17 anos: modo link recusado');
select throws_ok(format($$ select request_pitchvision_link_analysis(%L, 'AbCdEfGhIj0', 90, 'full_match', 10, 'azul', 'CM', '03:12', 'pvl-2026-11', 'r', 'p') $$,
  (select id from ids where k = 'b20')), null, 'not allowed', 'A não pede pelo atleta de B');
select throws_ok(format($$ select request_pitchvision_link_analysis(%L, 'curto', 90, 'full_match', 10, 'azul', 'CM', '03:12', 'pvl-2026-11', 'r', 'p') $$,
  (select id from ids where k = 'a21')), null, 'invalid link', 'id do YouTube inválido');
select throws_ok(format($$ select request_pitchvision_link_analysis(%L, 'AbCdEfGhIj0', 90, 'full_match', 10, 'azul', 'CM', '03:12', '', 'r', 'p') $$,
  (select id from ids where k = 'a21')), null, 'consent required', 'sem consentimento não há pedido');
select throws_ok(format($$ select request_pitchvision_link_analysis(%L, 'AbCdEfGhIj0', 90, 'full_match', 10, 'azul', 'CM', '3h', 'pvl-2026-11', 'r', 'p') $$,
  (select id from ids where k = 'a21')), '23514', null, 'tempo em que aparece precisa ser MM:SS');
insert into ids select 'r21', request_pitchvision_link_analysis((select id from ids where k = 'a21'), 'AbCdEfGhIj0', 90, 'full_match', 10, 'azul', 'CM', '03:12', 'pvl-2026-11', 'r', 'p');
select is((select status::text || '/' || provider || '/' || pv_source || '/' || youtube_id || '/' || link_appears_at from ai_analysis_requests where id = (select id from ids where k = 'r21')),
  'queued/pitchvision/link/AbCdEfGhIj0/03:12', '21 anos: pedido pelo link na fila');
select ok((select analysis_video_id is null and media_id is null from ai_analysis_requests where id = (select id from ids where k = 'r21')), 'pedido pelo link não aponta arquivo');
select lives_ok(format($$ select request_pitchvision_link_analysis(%L, 'AbCdEfGhIj0', 90, 'full_match', 7, 'azul', 'ST', null, 'pvl-2026-11', 'r', 'p') $$,
  (select id from ids where k = 'a18')), '18 anos: permitido');
select throws_ok(format($$ select request_pitchvision_link_analysis(%L, 'AbCdEfGhIj0', 90, 'full_match', 10, 'azul', 'CM', '03:12', 'pvl-2026-11', 'r', 'p') $$,
  (select id from ids where k = 'a21')), null, 'request already active', 'um pedido ativo por atleta');

-- o gatilho segura mesmo fora da função: nem o serviço grava pedido pelo link de menor
select pg_temp.as_service();
select throws_ok(format($$ insert into ai_analysis_requests (athlete_id, provider, pv_source, requested_by, consent_id, status, video_type,
  youtube_id, video_minutes, shirt_number, shirt_color, position, rubric_version, prompt_version, model)
  select %L, 'pitchvision', 'link', requested_by, consent_id, 'queued', 'full_match', 'AbCdEfGhIj0', 90, 10, 'azul', 'CM', 'r', 'p', 'x'
  from ai_analysis_requests where id = %L $$, (select id from ids where k = 'a17'), (select id from ids where k = 'r21')),
  'P0001', 'link mode adults only', 'gatilho: pedido pelo link de menor é recusado no banco');
select throws_ok(format($$ update ai_analysis_requests set provider = 'gemini' where id = %L $$, (select id from ids where k = 'r21')),
  'P0001', 'link mode adults only', 'origem link só para a PitchVision');

-- ---------------------------------------------------------------- integrador: só serviço
select pg_temp.as_user('a3000000-0000-0000-0000-00000000000a');
select throws_ok($$ select * from pv_link_requests_to_send(10) $$, '42501', null, 'usuário não lê a fila do modo link');
select throws_ok(format($$ select pv_fail_unsent(%L, 'x') $$, (select id from ids where k = 'r21')), '42501', null, 'usuário não falha pedido');
select pg_temp.as_service();
select is((select count(*)::int from pv_link_requests_to_send(10)), 2, 'fila do modo link: 2 pedidos');
select is((select count(*)::int from pv_requests_to_send(10)), 0, 'pedidos pelo link não entram na fila de arquivos');
select ok((select bool_and(adult) from pv_link_requests_to_send(10)), 'a fila confere a idade de novo');
select is(pv_fail_unsent((select request_id from pv_link_requests_to_send(10) where shirt_number = 7), 'vídeo privado'), true, 'recusa da PitchVision encerra o pedido');
select is((select status::text from ai_analysis_requests where shirt_number = 7 and pv_source = 'link'), 'failed', 'pedido recusado fica como falha');
select is(pv_link_request((select id from ids where k = 'r21'), 'lm1', 'lr1', 'athlete_metrics'), true, 'pedido pelo link ligado à PitchVision');

-- ---------------------------------------------------------------- relatório sem nota (origem link) e certo/errado
insert into ids select 'rep', pv_save_report('lr1', 'mid', 0, 'low', 'Momentos apontados por IA, não verificados.', null, null, null,
  '{"mode": "link", "ai_unverified": {"moments": [{"id": "m1", "time": "01:05"}]}}');
select is((select pv_source || '/' || coalesce(analysis_video_id::text, 'sem arquivo') from ai_video_reports where id = (select id from ids where k = 'rep')),
  'link/sem arquivo', 'relatório do modo link gravado');
select is((select status::text from ai_analysis_requests where id = (select id from ids where k = 'r21')), 'completed', 'pedido concluído');

select pg_temp.as_user('a3000000-0000-0000-0000-00000000000a');
select ok(pv_link_feedback((select id from ids where k = 'rep'), 'm1', 'correct') is not null, 'responsável marca certo');
select lives_ok(format($$ select pv_link_feedback(%L, 'm1', 'incorrect') $$, (select id from ids where k = 'rep')), 'responsável muda para errado');
select is((select verdict from ai_moment_feedback), 'incorrect', 'vale o último voto (uma linha por momento)');
select throws_ok(format($$ select pv_link_feedback(%L, 'm1', 'talvez') $$, (select id from ids where k = 'rep')), null, 'invalid verdict', 'só certo ou errado');
select throws_ok(format($$ select pv_link_feedback(%L, 'zz', 'correct') $$, (select id from ids where k = 'rep')), '23514', null, 'id de momento inválido');
select throws_ok(format($$ insert into ai_moment_feedback (report_id, athlete_id, moment_id, verdict, profile_id) values (%L, %L, 'm2', 'correct', public.vp_uid()) $$,
  (select id from ids where k = 'rep'), (select id from ids where k = 'a21')), '42501', null, 'certo/errado não é gravado direto na tabela');
select throws_ok(format($$ select pv_feedback_synced(%L) $$, (select id from ai_moment_feedback limit 1)), '42501', null, 'usuário não marca sincronização');

select pg_temp.as_user('b3000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from ai_moment_feedback), 0, 'B não vê o certo/errado de A');
select throws_ok(format($$ select pv_link_feedback(%L, 'm1', 'correct') $$, (select id from ids where k = 'rep')), null, 'not allowed', 'B não marca no relatório de A');

select pg_temp.as_service();
select lives_ok(format($$ select pv_feedback_synced(%L) $$, (select id from ai_moment_feedback limit 1)), 'serviço marca o repasse à PitchVision');
select pg_temp.as_user('a3000000-0000-0000-0000-00000000000a');
select ok((select pv_synced_at is not null from ai_moment_feedback), 'repasse registrado');
select lives_ok(format($$ select delete_ai_report(%L) $$, (select id from ids where k = 'rep')), 'responsável exclui o relatório');
select pg_temp.as_service();
select is((select count(*)::int from ai_moment_feedback), 0, 'excluir o relatório apaga o certo/errado');

select * from finish();
rollback;
