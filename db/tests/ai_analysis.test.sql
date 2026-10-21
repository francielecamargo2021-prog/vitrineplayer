-- Testes da avaliação por IA (pgTAP). Rodar: npx supabase test db
-- ou, sem Docker: supabase/tests/local/run.sh
-- Cenário: responsáveis A e B; P1 (clube aprovado), P2 (clube que A bloqueou),
-- P3 (marca aprovada); anônimo.
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
  ('a1000000-0000-0000-0000-00000000000a', 'ia-a@test.dev', '{"full_name":"Resp A"}'),
  ('b1000000-0000-0000-0000-00000000000b', 'ia-b@test.dev', '{"full_name":"Resp B","locale":"es"}'),
  ('c1000000-0000-0000-0000-0000000000c1', 'ia-p1@test.dev', '{"full_name":"Pro 1"}'),
  ('c1000000-0000-0000-0000-0000000000c2', 'ia-p2@test.dev', '{"full_name":"Pro 2"}'),
  ('c1000000-0000-0000-0000-0000000000c3', 'ia-p3@test.dev', '{"full_name":"Marca"}');
update profiles set role = 'PROFESSIONAL' where email in ('ia-p1@test.dev', 'ia-p2@test.dev', 'ia-p3@test.dev');
insert into organizations (id, name, kind, country, status) values
  ('d1000000-0000-0000-0000-0000000000d1', 'Clube Um', 'club', 'BR', 'approved'),
  ('d1000000-0000-0000-0000-0000000000d2', 'Clube Dois', 'club', 'BR', 'approved'),
  ('d1000000-0000-0000-0000-0000000000d3', 'Marca Três', 'brand', 'BR', 'approved');
insert into organization_members (organization_id, profile_id) values
  ('d1000000-0000-0000-0000-0000000000d1', 'c1000000-0000-0000-0000-0000000000c1'),
  ('d1000000-0000-0000-0000-0000000000d2', 'c1000000-0000-0000-0000-0000000000c2'),
  ('d1000000-0000-0000-0000-0000000000d3', 'c1000000-0000-0000-0000-0000000000c3');

create temp table ids (k text primary key, id uuid) on commit drop;
grant all on ids to authenticated, anonymous;

-- ---------------------------------------------------------------- configurações seguras por padrão
select is((select enabled from ai_settings), false, 'processamento desligado por padrão');
select is((select model from ai_settings), 'gemini-3.8-flash', 'modelo padrão confirmado na documentação');

-- ---------------------------------------------------------------- dados dos atletas
select pg_temp.as_user('a1000000-0000-0000-0000-00000000000a');
insert into ids values ('athA', create_athlete('Atleta A', 'A', '2011-03-10', 'BR'));
insert into athlete_media (athlete_id, kind, url, external_id, video_type)
  select id, 'youtube', 'https://www.youtube.com/watch?v=AAAAAAAAAAA', 'AAAAAAAAAAA', 'highlights' from ids where k = 'athA';
insert into ids select 'vidA', id from athlete_media where external_id = 'AAAAAAAAAAA';
insert into athlete_media (athlete_id, kind, storage_path) select id, 'photo', id || '/p.webp' from ids where k = 'athA';
insert into ids select 'photoA', id from athlete_media where storage_path like '%/p.webp';

select pg_temp.as_user('b1000000-0000-0000-0000-00000000000b');
insert into ids values ('athB', create_athlete('Atleta B', 'B', '2010-05-01', 'AR'));
insert into athlete_media (athlete_id, kind, url, external_id, video_type)
  select id, 'youtube', 'https://www.youtube.com/watch?v=BBBBBBBBBBB', 'BBBBBBBBBBB', 'full_match' from ids where k = 'athB';
insert into ids select 'vidB', id from athlete_media where external_id = 'BBBBBBBBBBB';

-- ---------------------------------------------------------------- pedido: só o responsável, só vídeo do YouTube do próprio atleta
select pg_temp.as_user('a1000000-0000-0000-0000-00000000000a');
select throws_ok(format($$ select request_ai_analysis(%L, 'full_match', 90, 9, 'verde', 'ST', 'v1', 'r1', 'p1') $$, (select id from ids where k = 'vidB')),
  null, 'not allowed', 'A não pede avaliação com vídeo do atleta de B');
select throws_ok(format($$ select request_ai_analysis(%L, 'highlights', 4, 9, 'verde', 'ST', 'v1', 'r1', 'p1') $$, (select id from ids where k = 'photoA')),
  null, 'not allowed', 'foto não pode ser avaliada (só vídeo do YouTube)');
select throws_ok(format($$ select request_ai_analysis(%L, 'goal_play', 4, 9, 'verde', 'ST', 'v1', 'r1', 'p1') $$, (select id from ids where k = 'vidA')),
  null, 'invalid video type', 'tipo precisa ser melhores momentos, partida ou treino');
select throws_ok(format($$ select request_ai_analysis(%L, 'highlights', 4, 9, 'verde', 'ST', '', 'r1', 'p1') $$, (select id from ids where k = 'vidA')),
  null, 'consent required', 'sem consentimento não há pedido');
select throws_ok(format($$ insert into ai_analysis_requests (athlete_id, media_id, requested_by, consent_id, video_type, youtube_id, video_minutes, shirt_number, shirt_color, position, rubric_version, prompt_version, model)
  select a.id, v.id, public.vp_uid(), gen_random_uuid(), 'highlights', 'AAAAAAAAAAA', 4, 9, 'verde', 'ST', 'r', 'p', 'm' from ids a, ids v where a.k = 'athA' and v.k = 'vidA' $$),
  '42501', null, 'pedido não é criado direto na tabela');

select throws_ok(format($$ select request_ai_analysis(%L, 'highlights', 4, 9, 'verde', 'ST', 'v1', 'r1', 'p1') $$, (select id from ids where k = 'vidA')),
  null, 'no analyses available', 'sem crédito não há pedido (nenhuma análise incluída no cadastro gratuito)');
-- crédito (cortesia agora; compra no futuro) para os dois atletas
select pg_temp.as_service();
insert into ai_analysis_grants (athlete_id, quantity, reason) select id, 1, 'crédito de teste' from ids where k in ('athA', 'athB');
select pg_temp.as_user('a1000000-0000-0000-0000-00000000000a');
insert into ids select 'reqA', request_ai_analysis((select id from ids where k = 'vidA'), 'highlights', 4, 9, 'verde', 'ST', '2026-10', 'rubric-2026.10-v1', 'prompt-2026.10-v1');
select is((select status::text from ai_analysis_requests where id = (select id from ids where k = 'reqA')), 'queued', 'com crédito: entra direto na fila (sem pagamento do cadastro)');
select is((select count(*)::int from consents where kind = 'ai_video_analysis' and athlete_id = (select id from ids where k = 'athA')), 1, 'consentimento específico registrado');
select is((select report_locale from ai_analysis_requests where id = (select id from ids where k = 'reqA')), 'pt-BR', 'idioma do relatório segue a conta');
select throws_ok(format($$ select request_ai_analysis(%L, 'highlights', 4, 9, 'verde', 'ST', 'v1', 'r1', 'p1') $$, (select id from ids where k = 'vidA')),
  null, 'request already active', 'um pedido ativo por atleta (sem duplicidade)');
select is((select count(*)::int from ai_analysis_jobs), 0, 'responsável não lê a fila interna');
select is((select count(*)::int from ai_batches), 0, 'responsável não lê lotes');
update ai_settings set enabled = true;   -- RLS: o responsável não enxerga a linha; nada muda
select pg_temp.as_service();
select is((select enabled from ai_settings), false, 'responsável não consegue ligar o processamento');

select pg_temp.as_user('b1000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from ai_analysis_requests), 0, 'B não vê pedidos de A');
select throws_ok(format($$ select cancel_ai_analysis(%L) $$, (select id from ids where k = 'reqA')), null, 'not allowed', 'B não cancela pedido de A');
select throws_ok($$ select ai_claim_jobs(array[gen_random_uuid()], gen_random_uuid()) $$, '42501', null, 'usuário não opera a fila do processador');

-- ---------------------------------------------------------------- fila
select pg_temp.as_service();
select ok((select queued_at is not null from ai_analysis_requests where id = (select id from ids where k = 'reqA')), 'horário de entrada na fila registrado');

-- ---------------------------------------------------------------- processador: reserva única, devolução, conclusão única
insert into ai_analysis_jobs (id, request_id, kind, start_s, end_s, estimated_cost_usd)
  values ('f1000000-0000-0000-0000-0000000000f1', (select id from ids where k = 'reqA'), 'analyze', 0, 240, 0.15);
insert into ai_batches (id, model) values ('b9000000-0000-0000-0000-000000000001', 'gemini-3.8-flash'), ('b9000000-0000-0000-0000-000000000002', 'gemini-3.8-flash');
select is((select count(*)::int from ai_claim_jobs(array['f1000000-0000-0000-0000-0000000000f1'::uuid], 'b9000000-0000-0000-0000-000000000001')), 1, 'item reservado para o lote');
select is((select count(*)::int from ai_claim_jobs(array['f1000000-0000-0000-0000-0000000000f1'::uuid], 'b9000000-0000-0000-0000-000000000002')), 0, 'item não entra em dois lotes');
select is(ai_spent_since(now() - interval '1 day'), 0.15::numeric, 'item em processamento conta no orçamento pela estimativa');
select is(ai_complete_job('f1000000-0000-0000-0000-0000000000f1', 'b9000000-0000-0000-0000-000000000002', '{}', 1, 1, 0.1), false, 'resultado de outro lote é ignorado');
select is(ai_complete_job('f1000000-0000-0000-0000-0000000000f1', 'b9000000-0000-0000-0000-000000000001', '{}', 60000, 9000, 0.1125), true, 'resultado aplicado');
select is(ai_complete_job('f1000000-0000-0000-0000-0000000000f1', 'b9000000-0000-0000-0000-000000000001', '{}', 60000, 9000, 0.1125), false, 'resultado repetido não é aplicado de novo');
select is((select cost_usd from ai_analysis_requests where id = (select id from ids where k = 'reqA')), 0.1125::numeric, 'custo real acumulado no pedido');
select is((select cost_usd from ai_batches where id = 'b9000000-0000-0000-0000-000000000001'), 0.1125::numeric, 'custo real acumulado no lote');

-- relatório gerado (como o processador grava) — nasce não publicado
insert into ai_video_reports (id, request_id, athlete_id, media_id, video_type, position, position_group, rubric_version, model, overall_score, coverage, confidence, summary, report)
  select 'a9000000-0000-0000-0000-000000000001', q.id, q.athlete_id, q.media_id, q.video_type, q.position, 'st', q.rubric_version, q.model, 3.7, 0.69, 'medium', 'Resumo', '{}'
  from ai_analysis_requests q where q.id = (select id from ids where k = 'reqA');
insert into ai_report_scores (report_id, athlete_id, criterion, score, confidence, evidence_count)
  select 'a9000000-0000-0000-0000-000000000001', id, 'finishing', 4, 'high', 2 from ids where k = 'athA';
select ai_set_request_status((select id from ids where k = 'reqA'), 'completed');
-- atleta aprovado e visível
update athletes set status = 'approved', approved_at = now() where id = (select id from ids where k = 'athA');

-- ---------------------------------------------------------------- visibilidade para profissionais
select pg_temp.as_user('c1000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from ai_video_reports), 0, 'relatório não publicado é invisível para profissionais');
select is((select count(*)::int from ai_report_scores), 0, 'notas de relatório não publicado são invisíveis');

select pg_temp.as_user('b1000000-0000-0000-0000-00000000000b');
select throws_ok($$ select set_ai_report_published('a9000000-0000-0000-0000-000000000001', true) $$, null, 'not allowed', 'B não publica relatório de A');

select pg_temp.as_user('a1000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from ai_video_reports), 1, 'responsável vê o relatório antes de publicar');
select set_ai_report_published('a9000000-0000-0000-0000-000000000001', true);
insert into athlete_org_blocks (athlete_id, organization_id) select id, 'd1000000-0000-0000-0000-0000000000d2' from ids where k = 'athA';

select pg_temp.as_user('c1000000-0000-0000-0000-0000000000c1');
select ok(pro_ai_report((select id from ids where k = 'athA')) is not null, 'clube autorizado vê o relatório publicado (pela função do portal)');
select ok(exists (select 1 from jsonb_array_elements(pro_ai_report((select id from ids where k = 'athA'))->'scores') x where x->>'criterion' = 'finishing' and (x->>'score')::int >= 4), 'notas publicadas por fundamento chegam ao profissional');
select is((select count(*)::int from ai_analysis_requests), 0, 'profissional não vê pedidos (dados do pedido)');

select pg_temp.as_user('c1000000-0000-0000-0000-0000000000c2');
select ok(pro_ai_report((select id from ids where k = 'athA')) is null, 'organização bloqueada não vê o relatório');
select is((select count(*)::int from ai_report_scores), 0, 'organização bloqueada não vê as notas');

select pg_temp.as_user('c1000000-0000-0000-0000-0000000000c3');
select ok(pro_ai_report((select id from ids where k = 'athA')) is null, 'marca não tem acesso a avaliações esportivas');

select pg_temp.as_anon();
select is((select count(*)::int from ai_video_reports), 0, 'anônimo não vê relatórios');

-- pausar o perfil esconde o relatório
select pg_temp.as_user('a1000000-0000-0000-0000-00000000000a');
update athletes set visibility = 'paused' where id = (select id from ids where k = 'athA');
select pg_temp.as_user('c1000000-0000-0000-0000-0000000000c1');
select ok(pro_ai_report((select id from ids where k = 'athA')) is null, 'perfil pausado esconde o relatório');
select pg_temp.as_user('a1000000-0000-0000-0000-00000000000a');
update athletes set visibility = 'active' where id = (select id from ids where k = 'athA');

-- despublicar e excluir
select set_ai_report_published('a9000000-0000-0000-0000-000000000001', false);
select pg_temp.as_user('c1000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from ai_video_reports), 0, 'despublicado some da vitrine');

select pg_temp.as_user('a1000000-0000-0000-0000-00000000000a');
select throws_ok(format($$ select request_ai_analysis(%L, 'highlights', 4, 9, 'verde', 'ST', 'v1', 'r1', 'p1') $$, (select id from ids where k = 'vidA')),
  null, 'no analyses available', 'crédito já consumido: novo pedido bloqueado');
select delete_ai_report('a9000000-0000-0000-0000-000000000001');
select is((select count(*)::int from ai_video_reports), 0, 'responsável exclui o relatório');
select ok((select revoked_at is not null from consents where kind = 'ai_video_analysis' and athlete_id = (select id from ids where k = 'athA')), 'excluir revoga o consentimento da análise');
select throws_ok(format($$ select request_ai_analysis(%L, 'highlights', 4, 9, 'verde', 'ST', 'v1', 'r1', 'p1') $$, (select id from ids where k = 'vidA')),
  null, 'no analyses available', 'excluir não devolve o crédito consumido');

-- avaliação adicional concedida (cortesia/compra futura) libera novo pedido
select pg_temp.as_service();
insert into ai_analysis_grants (athlete_id, quantity, reason) select id, 1, 'teste' from ids where k = 'athA';
select pg_temp.as_user('a1000000-0000-0000-0000-00000000000a');
select lives_ok(format($$ select request_ai_analysis(%L, 'highlights', 4, 9, 'verde', 'ST', 'v1', 'r1', 'p1') $$, (select id from ids where k = 'vidA')),
  'novo crédito concedido permite novo pedido');
select is((select count(*)::int from ai_analysis_requests where status = 'queued'), 1, 'novo pedido entra direto na fila');

-- cancelamento
select cancel_ai_analysis((select id from ai_analysis_requests where status = 'queued'));
select is((select count(*)::int from ai_analysis_requests where status = 'cancelled'), 1, 'responsável cancela pedido ainda não concluído');

-- responsável espanhol: relatório em espanhol
select pg_temp.as_service();
update profiles set locale = 'es' where id = 'b1000000-0000-0000-0000-00000000000b';
select pg_temp.as_user('b1000000-0000-0000-0000-00000000000b');
insert into ids select 'reqB', request_ai_analysis((select id from ids where k = 'vidB'), 'full_match', 90, 7, 'branco', 'CM', 'v1', 'r1', 'p1');
select is((select report_locale from ai_analysis_requests where id = (select id from ids where k = 'reqB')), 'es', 'responsável em espanhol recebe relatório em espanhol');

-- remover o vídeo remove pedido e relatório em cascata
delete from athlete_media where id = (select id from ids where k = 'vidB');
select is((select count(*)::int from ai_analysis_requests), 0, 'remover o vídeo remove o pedido');

select * from finish();
rollback;
