-- Fase A (0009): IA por crédito, relatório ao profissional por função, suspensão de conta,
-- moderação, denúncias com situação, notas/avaliações/funil ocultos com bloqueio, linha do
-- tempo, novidades e equipe por convite. Tudo dentro de begin/rollback.
begin;
create extension if not exists pgtap;
select no_plan();

create function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;
-- admin COM segundo fator: sessão de teste no banco + prova na requisição (0010)
create function pg_temp.as_admin(p_id uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  insert into admin_mfa_sessions (token_hash, profile_id, expires_at)
  values (encode(sha256(convert_to('teste-' || p_id, 'UTF8')), 'hex'), p_id, now() + interval '1 hour') on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'vp_mfa', 'teste-' || p_id)::text, true);
  execute 'set local role authenticated';
end $$;

create temp table ids (k text primary key, id uuid) on commit drop;
create temp table tok (k text primary key, v text) on commit drop;
grant all on ids, tok to authenticated, anonymous;

insert into neon_auth."user" (id, name, email, "emailVerified") values
  ('a9000000-0000-0000-0000-0000000000a1', 'Mãe Fase A', 'fa-g1@test.dev', true),
  ('a9000000-0000-0000-0000-0000000000a2', 'Outra Mãe', 'fa-g2@test.dev', true),
  ('a9000000-0000-0000-0000-0000000000b1', 'Olheiro Dono', 'fa-p1@test.dev', true),
  ('a9000000-0000-0000-0000-0000000000b2', 'Clube Dono', 'fa-p2@test.dev', true),
  ('a9000000-0000-0000-0000-0000000000b3', 'Colega Convidado', 'fa-p3@test.dev', true),
  ('a9000000-0000-0000-0000-0000000000c1', 'Admin Fase A', 'fa-admin@test.dev', true);
update profiles set role = 'ADMIN' where id = 'a9000000-0000-0000-0000-0000000000c1';

select pg_temp.as_user('a9000000-0000-0000-0000-0000000000a1');
insert into ids values ('ath', create_athlete('Pedro Henrique Lima', 'Pedrinho', (current_date - interval '15 years')::date, 'BR', 'mother'));
update athletes set primary_position = 'ST', category = 'Sub-15' where id = (select id from ids where k = 'ath');
insert into athlete_media (athlete_id, kind, url, external_id) select id, 'youtube', 'https://www.youtube.com/watch?v=abcdefghijk', 'abcdefghijk' from ids where k = 'ath';
insert into ids select 'video', id from athlete_media where external_id = 'abcdefghijk';
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000a2');
insert into ids values ('ath2', create_athlete('Ana Souza', 'Aninha', (current_date - interval '14 years')::date, 'BR', 'mother'));
insert into athlete_media (athlete_id, kind, url, external_id) select id, 'youtube', 'https://www.youtube.com/watch?v=zzzzzzzzzzz', 'zzzzzzzzzzz' from ids where k = 'ath2';
insert into ids select 'video2', id from athlete_media where external_id = 'zzzzzzzzzzz';
select pg_temp.as_service();
update athletes set status = 'approved', approved_at = now() where id in (select id from ids where k in ('ath', 'ath2'));
select pg_temp.as_owner();
insert into storage.objects (bucket_id, name, blob_url) select 'athlete-photos', id || '/p1.webp', 'atletas/' || id || '/p1.webp' from ids where k = 'ath';
insert into storage.objects (bucket_id, name, blob_url) select 'athlete-photos', id || '/p2.webp', 'atletas/' || id || '/p2.webp' from ids where k = 'ath';
insert into athlete_media (athlete_id, kind, storage_path, is_primary, position) select id, 'photo', id || '/p1.webp', true, 0 from ids where k = 'ath';
insert into athlete_media (athlete_id, kind, storage_path, is_primary, position) select id, 'photo', id || '/p2.webp', false, 1 from ids where k = 'ath';
insert into ids select 'photo1', id from athlete_media where storage_path like '%/p1.webp';

-- profissionais: olheiro (org A) e clube (org B), aprovados
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000b1');
insert into ids values ('orgA', complete_professional_signup('+5511900000001', 'BR', 'pt-BR', array['terms', 'privacy', 'pro_conduct'], 'v',
  '{"name":"Olheiro A","kind":"scout","document":"111","contact_role":"Olheiro"}'));
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000b2');
insert into ids values ('orgB', complete_professional_signup('+5511900000002', 'BR', 'pt-BR', array['terms', 'privacy', 'pro_conduct'], 'v',
  '{"name":"Clube B","kind":"club","document":"222","contact_role":"Diretor"}'));
select pg_temp.as_admin('a9000000-0000-0000-0000-0000000000c1');
select admin_review_organization((select id from ids where k = 'orgA'), 'approve');
select admin_review_organization((select id from ids where k = 'orgB'), 'approve');

-- ================================================================ IA
select pg_temp.as_owner();
select is((select included_per_athlete from ai_settings), 0::smallint, 'nenhuma análise de IA incluída no cadastro gratuito');
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000a1');
select throws_ok(format($$ select request_ai_analysis(%L, 'highlights', 5, 9, 'azul', 'ST', 'v1', 'r', 'p') $$, (select id from ids where k = 'video')),
  'P0001', 'no analyses available', 'sem crédito, não há pedido');
select pg_temp.as_admin('a9000000-0000-0000-0000-0000000000c1');
select throws_ok(format($$ select admin_ai_grant(%L, 1, 'x') $$, (select id from ids where k = 'ath')), 'P0001', 'note required', 'cortesia exige motivo');
select lives_ok(format($$ select admin_ai_grant(%L, 1, 'Cortesia do piloto') $$, (select id from ids where k = 'ath')), 'admin concede uma análise de cortesia');
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000a1');
insert into ids values ('req', request_ai_analysis((select id from ids where k = 'video'), 'highlights', 5, 9, 'azul', 'ST', 'v1', 'r', 'p'));
select is((select status::text from ai_analysis_requests where id = (select id from ids where k = 'req')), 'queued', 'com crédito o pedido entra na fila (sem pagamento do cadastro)');
select pg_temp.as_owner();
select is((select enabled from ai_settings), false, 'IA real continua desligada');
select pg_temp.as_admin('a9000000-0000-0000-0000-0000000000c1');
select lives_ok($$ select admin_update_ai_settings(4, 40, 3, 15) $$, 'admin ajusta orçamento e limites da IA');
select is((select enabled from ai_settings), false, 'ajustar limites não liga a IA');
select throws_ok($$ select admin_update_ai_settings(50, 10, 3, 15) $$, 'P0001', 'invalid settings', 'orçamento diário não passa do mensal');

-- relatório publicado chega ao profissional só pela função
select pg_temp.as_owner();
insert into ai_video_reports (request_id, athlete_id, media_id, video_type, position, position_group, rubric_version, model,
                              overall_score, coverage, confidence, summary, report)
select (select id from ids where k = 'req'), (select id from ids where k = 'ath'), (select id from ids where k = 'video'),
       'highlights', 'ST', 'st', 'rubric-2026.10-v1', 'gemini-teste', 3.5, 0.8, 'medium', 'Boa movimentação.', '{}';
insert into ids select 'report', id from ai_video_reports where request_id = (select id from ids where k = 'req');
insert into ai_report_scores (report_id, athlete_id, criterion, score, confidence, evidence_count)
select (select id from ids where k = 'report'), (select id from ids where k = 'ath'), 'finishing', 4, 'medium', 3;
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000b1');
select ok(pro_ai_report((select id from ids where k = 'ath')) is null, 'relatório não publicado não aparece');
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000a1');
select set_ai_report_published((select id from ids where k = 'report'), true);
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000b1');
select is(pro_ai_report((select id from ids where k = 'ath'))->>'summary', 'Boa movimentação.', 'publicado, o profissional vê o resumo');
select is(jsonb_array_length(pro_ai_report((select id from ids where k = 'ath'))->'scores'), 1, 'e as notas por fundamento');
select ok(not (pro_ai_report((select id from ids where k = 'ath')) ?| array['model', 'request_id', 'report', 'cost_usd']), 'sem modelo, ids internos ou relatório bruto');
select is((select count(*)::int from ai_video_reports), 0, 'profissional não lê a tabela de relatórios');
select is((select count(*)::int from ai_report_scores), 0, 'nem a de notas');

-- ================================================================ notas, avaliações e funil
select lives_ok(format($$ insert into pro_notes (organization_id, athlete_id, author_id, body, tags) values (%L, %L, public.vp_uid(), 'Bom pivô, rever jogo completo', array['rever video']) $$,
  (select id from ids where k = 'orgA'), (select id from ids where k = 'ath')), 'nota privada');
select lives_ok(format($$ insert into scout_evaluations (organization_id, athlete_id, author_id, rubric_version, position_group, scores, media_id, video_minute, context, observation)
  values (%L, %L, public.vp_uid(), 'rubric-2026.10-v1', 'st', '{"finishing":4,"off_ball_movement":3}', %L, 12, 'video', 'Finaliza bem com a esquerda') $$,
  (select id from ids where k = 'orgA'), (select id from ids where k = 'ath'), (select id from ids where k = 'video')),
  'profissional (não só SCOUT) registra avaliação pela rubrica');
select throws_ok(format($$ insert into scout_evaluations (organization_id, athlete_id, author_id, rubric_version, position_group, scores) values (%L, %L, public.vp_uid(), 'r', 'st', '{"finishing":6}') $$,
  (select id from ids where k = 'orgA'), (select id from ids where k = 'ath')), '23514', null, 'nota fora de 1–5 é recusada');
select throws_ok(format($$ insert into scout_evaluations (organization_id, athlete_id, author_id, rubric_version, position_group, scores, media_id) values (%L, %L, public.vp_uid(), 'r', 'st', '{"finishing":3}', %L) $$,
  (select id from ids where k = 'orgA'), (select id from ids where k = 'ath'), (select id from ids where k = 'video2')), 'P0001', 'invalid media', 'vídeo citado precisa ser do próprio atleta');
select throws_ok(format($$ insert into scout_evaluations (organization_id, athlete_id, author_id, technical, potential) values (%L, %L, public.vp_uid(), 8, 9) $$,
  (select id from ids where k = 'orgA'), (select id from ids where k = 'ath')), '42501', null, 'escala antiga (mental/potencial) não é mais aceita');
select lives_ok(format($$ insert into pro_tracking (organization_id, athlete_id, stage, updated_by) values (%L, %L, 'evaluated', public.vp_uid()) $$,
  (select id from ids where k = 'orgA'), (select id from ids where k = 'ath')), 'funil: etapa "avaliado"');
select throws_ok(format($$ insert into pro_tracking (organization_id, athlete_id, stage, updated_by) values (%L, %L, 'contratado', public.vp_uid()) $$,
  (select id from ids where k = 'orgA'), (select id from ids where k = 'ath2')), '23514', null, 'só as etapas aprovadas');
select ok((select count(*) from pro_athlete_timeline((select id from ids where k = 'ath'))) >= 3, 'linha do tempo reúne nota, avaliação e etapa');

select pg_temp.as_user('a9000000-0000-0000-0000-0000000000b2');
select is((select count(*)::int from pro_notes), 0, 'outra organização não vê as notas');
select is((select count(*)::int from scout_evaluations), 0, 'nem as avaliações');
select is((select count(*)::int from pro_tracking), 0, 'nem o funil');
select is((select count(*)::int from pro_athlete_timeline((select id from ids where k = 'ath'))), 0, 'nem a linha do tempo');

-- bloqueio esconde (não apaga)
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000a1');
insert into athlete_org_blocks (athlete_id, organization_id) select (select id from ids where k = 'ath'), (select id from ids where k = 'orgA');
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from pro_notes), 0, 'com bloqueio, as notas ficam ocultas');
select is((select count(*)::int from scout_evaluations), 0, 'as avaliações também');
select is((select count(*)::int from pro_tracking), 0, 'e o funil');
select pg_temp.as_owner();
select is((select count(*)::int from pro_notes where organization_id = (select id from ids where k = 'orgA')), 1, 'ocultas, mas não apagadas');
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000a1');
delete from athlete_org_blocks where athlete_id = (select id from ids where k = 'ath');
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from pro_notes), 1, 'sem bloqueio, voltam a aparecer');

-- novidades desde a última visita
select pro_athlete_profile((select id from ids where k = 'ath'));
select pg_temp.as_owner();
update athlete_views set viewed_at = now() - interval '1 hour' where athlete_id = (select id from ids where k = 'ath');
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000a1');
insert into athlete_media (athlete_id, kind, url, external_id) select id, 'youtube', 'https://www.youtube.com/watch?v=bbbbbbbbbbb', 'bbbbbbbbbbb' from ids where k = 'ath';
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from pro_updates(array[(select id from ids where k = 'ath'), (select id from ids where k = 'ath2')])), 1, 'vídeo novo marca o atleta como atualizado');

-- ================================================================ equipe por convite
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000b1');
insert into tok values ('invite', org_invite_create());
select is((select org_member_slots((select id from ids where k = 'orgA'))), 3, 'dono + convite pendente: restam 3 vagas');
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000b3');
select is(org_invite_info((select v from tok where k = 'invite'))->>'name', 'Olheiro A', 'quem recebe o link vê a organização');
select throws_ok($$ select complete_professional_join('+5511900000003', 'BR', 'pt-BR', array['terms', 'privacy', 'pro_conduct'], 'v', 'codigo-errado') $$,
  'P0001', 'invalid invite', 'convite inválido é recusado');
select lives_ok($$ select complete_professional_join('+5511900000003', 'BR', 'pt-BR', array['terms', 'privacy', 'pro_conduct'], 'v', (select v from tok where k = 'invite')) $$,
  'colega entra na equipe pelo convite');
select is((select count(*)::int from pro_notes), 1, 'colega vê as notas da organização');
delete from pro_notes;   -- a política só deixa o autor apagar: nada acontece
select throws_ok($$ select org_invite_create() $$, 'P0001', 'not allowed', 'só o dono convida');
select pg_temp.as_owner();
select is((select count(*)::int from pro_notes), 1, 'colega não apaga a nota de outra pessoa');
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000b1');
select ok(org_invite_info((select v from tok where k = 'invite')) is null, 'convite é de uso único');
insert into tok values ('i2', org_invite_create()), ('i3', org_invite_create()), ('i4', org_invite_create());
select throws_ok($$ select org_invite_create() $$, 'P0001', 'team full', 'equipe limitada a 5 pessoas');
select is((select count(*)::int from org_team()), 2, 'dono vê a equipe');
select lives_ok($$ select org_remove_member((select id from ids where k = 'orgA'), 'a9000000-0000-0000-0000-0000000000b3') $$, 'dono remove um membro');
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000b3');
select is((select count(*)::int from pro_search_athletes()), 0, 'membro removido perde o acesso');

-- ================================================================ denúncia com situação + cancelamento
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000b2');
insert into ids values ('int', pro_send_interest((select id from ids where k = 'ath'), 'Queremos convidar para uma avaliação no clube.'));
insert into ids values ('int2', pro_send_interest((select id from ids where k = 'ath2'), 'Queremos convidar para uma avaliação no clube.'));
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000a1');
select respond_interest((select id from ids where k = 'int'), 'report', 'Abordagem inadequada');
select pg_temp.as_admin('a9000000-0000-0000-0000-0000000000c1');
select is((select report_status from contact_requests where id = (select id from ids where k = 'int')), 'open', 'denúncia nasce aberta');
select throws_ok(format($$ select admin_resolve_report(%L, 'resolved') $$, (select id from ids where k = 'int')), 'P0001', 'note required', 'resolver exige registro');
select is(admin_resolve_report((select id from ids where k = 'int'), 'resolved', 'Organização advertida e suspensa', true), 'resolved', 'admin resolve a denúncia');
select is((select status::text from organizations where id = (select id from ids where k = 'orgB')), 'suspended', 'e pode suspender a organização na mesma decisão');
select lives_ok(format($$ select admin_cancel_interest(%L, 'Interesse de organização suspensa') $$, (select id from ids where k = 'int2')), 'admin cancela interesse abusivo');
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000a2');
select is((select status from guardian_interests()), 'expired', 'família vê o interesse como encerrado');

-- ================================================================ suspensão de conta, correção e moderação
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000a1');
select throws_ok($$ update profiles set suspended_at = now() where id = public.vp_uid() $$, 'P0001', 'campo não editável', 'ninguém mexe na própria suspensão');
select pg_temp.as_admin('a9000000-0000-0000-0000-0000000000c1');
select throws_ok($$ select admin_set_account_suspended('a9000000-0000-0000-0000-0000000000c1', true, 'teste de admin') $$, 'P0001', 'not allowed', 'admin não suspende admin');
select lives_ok($$ select admin_set_account_suspended('a9000000-0000-0000-0000-0000000000a2', true, 'Dados falsos no cadastro') $$, 'admin suspende conta de responsável');
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from athletes), 0, 'conta suspensa não vê os atletas');
update athletes set bio = 'tentativa' where id = (select id from ids where k = 'ath2');
select pg_temp.as_owner();
select ok((select bio from athletes where id = (select id from ids where k = 'ath2')) is null, 'nem altera os dados');
select pg_temp.as_admin('a9000000-0000-0000-0000-0000000000c1');
select lives_ok($$ select admin_set_account_suspended('a9000000-0000-0000-0000-0000000000a2', false) $$, 'admin reativa a conta');
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from athletes), 1, 'reativada, volta a ver o atleta');

select pg_temp.as_admin('a9000000-0000-0000-0000-0000000000c1');
select lives_ok(format($$ select admin_request_correction(%L, 'Atualize a categoria para Sub-15') $$, (select id from ids where k = 'ath')), 'admin pede correção');
select is(admin_remove_media((select id from ids where k = 'photo1'), 'Foto com outra pessoa identificável'), 'atletas/' || (select id from ids where k = 'ath') || '/p1.webp',
  'admin remove a foto e recebe o arquivo para apagar do Blob');
select is((select count(*)::int from athlete_media where athlete_id = (select id from ids where k = 'ath') and is_primary), 1, 'outra foto vira a principal');
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from athlete_correction_requests where resolved_at is null), 2, 'família vê o pedido de correção e o aviso da remoção');
select lives_ok($$ select resolve_correction((select id from athlete_correction_requests order by created_at limit 1)) $$, 'família marca como resolvido');
select pg_temp.as_user('a9000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from athlete_correction_requests), 0, 'outra família não vê');
select throws_ok(format($$ select admin_remove_media(%L, 'tentativa indevida') $$, (select id from ids where k = 'video2')), 'P0001', 'not allowed', 'só o admin modera');

select pg_temp.as_owner();
select * from finish();
rollback;
