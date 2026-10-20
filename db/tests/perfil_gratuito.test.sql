-- Regras do perfil gratuito (0007): maioridade do "próprio atleta", publicação gratuita
-- só via revisão do admin, modalidade, objetivos novos e limite de 20 vídeos.
-- Tudo dentro de begin/rollback: nenhum dado fica gravado.
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

create temp table ids (k text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

insert into neon_auth."user" (id, name, email, "emailVerified") values
  ('a1000000-0000-0000-0000-0000000000a1', 'Resp Gratis', 'gratis-a@test.dev', true),
  ('a2000000-0000-0000-0000-0000000000a2', 'Atleta Adulto', 'adulto@test.dev', true),
  ('a3000000-0000-0000-0000-0000000000a3', 'Pro Gratis', 'pro-gratis@test.dev', true);
update profiles set role = 'PROFESSIONAL' where id = 'a3000000-0000-0000-0000-0000000000a3';
insert into organizations (id, name, kind, country, status) values ('d1000000-0000-0000-0000-0000000000d1', 'Clube Grátis', 'club', 'BR', 'approved');
insert into organization_members (organization_id, profile_id) values ('d1000000-0000-0000-0000-0000000000d1', 'a3000000-0000-0000-0000-0000000000a3');

-- ---------------------------------------------------------------- maioridade
select pg_temp.as_user('a1000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select create_athlete('Menor Sozinho', '', (current_date - interval '15 years')::date, 'BR', 'self') $$,
  'P0001', 'minor needs guardian', 'menor de 18 não administra o próprio perfil');
select lives_ok($$ insert into ids values ('minor', create_athlete('Menor Com Mãe', 'Menor', (current_date - interval '15 years')::date, 'BR', 'mother')) $$,
  'menor com responsável legal é cadastrado');
select pg_temp.as_user('a2000000-0000-0000-0000-0000000000a2');
select lives_ok($$ insert into ids values ('adult', create_athlete('Adulto Sozinho', 'Adulto', (current_date - interval '19 years')::date, 'BR', 'self')) $$,
  'maior de 18 administra o próprio perfil');
select throws_ok(format($$ update athletes set birth_date = (current_date - interval '16 years')::date where id = %L $$, (select id from ids where k = 'adult')),
  'P0001', 'minor needs guardian', 'próprio atleta não pode mudar a data para menor de idade');
select pg_temp.as_owner();
select throws_ok(format($$ update athlete_guardians set relation = 'self' where athlete_id = %L $$, (select id from ids where k = 'minor')),
  'P0001', 'minor needs guardian', 'nem o dono do banco transforma o vínculo de um menor em "self"');

-- ---------------------------------------------------------------- campos novos
select pg_temp.as_user('a1000000-0000-0000-0000-0000000000a1');
select lives_ok(format($$ update athletes set modality = 'futsal', seeking = array['school', 'scouting_hub', 'agent']::seeking_kind[] where id = %L $$, (select id from ids where k = 'minor')),
  'modalidade futsal e objetivos escolinha / núcleo de captação');
select throws_ok(format($$ update athletes set modality = 'beach' where id = %L $$, (select id from ids where k = 'minor')),
  '22P02', null, 'modalidade desconhecida é recusada');

-- ---------------------------------------------------------------- vídeos: até 20
select lives_ok(format($$ insert into athlete_media (athlete_id, kind, url, external_id, position)
  select %L, 'youtube', 'https://www.youtube.com/watch?v=abcdefghi' || lpad(g::text, 2, '0'), 'abcdefghi' || lpad(g::text, 2, '0'), g from generate_series(1, 20) g $$,
  (select id from ids where k = 'minor')), '20 vídeos são aceitos');
select throws_ok(format($$ insert into athlete_media (athlete_id, kind, url, external_id) values (%L, 'youtube', 'https://www.youtube.com/watch?v=zzzzzzzzz21', 'zzzzzzzzz21') $$,
  (select id from ids where k = 'minor')), 'P0001', 'video limit reached', 'o 21º vídeo é recusado pelo banco');

-- ---------------------------------------------------------------- publicação gratuita
select throws_ok(format($$ update athletes set status = 'in_review' where id = %L $$, (select id from ids where k = 'minor')),
  'P0001', 'perfil incompleto para revisão', 'sem posição e categoria não vai para revisão');
select lives_ok(format($$ update athletes set primary_position = 'AM', category = 'Sub-15', status = 'in_review' where id = %L $$, (select id from ids where k = 'minor')),
  'perfil completo vai para revisão, sem pagamento');
select ok((select submitted_at from athletes where id = (select id from ids where k = 'minor')) is not null, 'data de envio registrada');
select lives_ok(format($$ update athletes set status = 'draft' where id = %L $$, (select id from ids where k = 'minor')), 'responsável pode desistir do envio');
select lives_ok(format($$ update athletes set status = 'in_review' where id = %L $$, (select id from ids where k = 'minor')), 'e reenviar');
select throws_ok(format($$ update athletes set status = 'approved' where id = %L $$, (select id from ids where k = 'minor')),
  'P0001', 'mudança de status não permitida', 'responsável não aprova (só o admin)');
select throws_ok(format($$ update athletes set review_note = 'ok' where id = %L $$, (select id from ids where k = 'minor')),
  'P0001', 'campo não editável', 'responsável não escreve a nota de revisão');

-- ---------------------------------------------------------------- privacidade continua igual
select pg_temp.as_user('a3000000-0000-0000-0000-0000000000a3');
select is((select count(*)::int from athletes), 0, 'profissional não vê atleta em revisão');
select pg_temp.as_owner();
select set_config('request.jwt.claims', '{"role":"service_role"}', true);   -- aprovação só por admin/serviço
update athletes set status = 'approved', approved_at = now() where id = (select id from ids where k = 'minor');
select pg_temp.as_user('a3000000-0000-0000-0000-0000000000a3');
select is((select count(*)::int from athletes), 1, 'profissional aprovado vê o atleta aprovado');
select is((select count(*)::int from profiles where id = 'a1000000-0000-0000-0000-0000000000a1'), 0, 'profissional não lê o contato do responsável do menor');
select pg_temp.as_user('a2000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from athletes), 1, 'um atleta não vê o perfil de outro atleta');
select pg_temp.as_user('a1000000-0000-0000-0000-0000000000a1');
insert into athlete_org_blocks (athlete_id, organization_id) select id, 'd1000000-0000-0000-0000-0000000000d1' from ids where k = 'minor';
select pg_temp.as_user('a3000000-0000-0000-0000-0000000000a3');
select is((select count(*)::int from athletes), 0, 'organização bloqueada deixa de ver o atleta');
select is((select count(*)::int from athlete_media), 0, 'nem os vídeos do atleta');
select pg_temp.as_owner();

select * from finish();
rollback;
