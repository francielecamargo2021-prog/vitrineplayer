-- Faixa etária (0015): cadastro de 6 a 22 anos, acesso por idade e tipo de organização
-- (faixa autorizada pelo admin), saída aos 23, fase formativa 6–10 e finalidade do interesse.
-- Tudo dentro de begin/rollback: nenhum dado fica gravado.
begin;
create extension if not exists pgtap;
select no_plan();

create function pg_temp.as_admin(p_id uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  insert into admin_mfa_sessions (token_hash, profile_id, expires_at)
  values (encode(sha256(convert_to('teste-' || p_id, 'UTF8')), 'hex'), p_id, now() + interval '1 hour') on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'vp_mfa', 'teste-' || p_id)::text, true);
  execute 'set local role authenticated';
end $$;
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
create temp table ids (k text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
create function pg_temp.id(p_k text) returns uuid language sql as $$ select id from ids where k = p_k $$;

-- contas: família G, admin A e um profissional por organização
insert into neon_auth."user" (id, name, email, "emailVerified") values
  ('e1000000-0000-0000-0000-0000000000e1', 'Família Faixa', 'faixa-g@test.dev', true),
  ('e2000000-0000-0000-0000-0000000000e2', 'Admin Faixa', 'faixa-admin@test.dev', true),
  ('e3000000-0000-0000-0000-0000000000e3', 'Escolinha Padrão', 'faixa-s@test.dev', true),
  ('e4000000-0000-0000-0000-0000000000e4', 'Escolinha Autorizada', 'faixa-s2@test.dev', true),
  ('e5000000-0000-0000-0000-0000000000e5', 'Clube Padrão', 'faixa-c@test.dev', true),
  ('e6000000-0000-0000-0000-0000000000e6', 'Núcleo Sem Faixa', 'faixa-h@test.dev', true),
  ('e7000000-0000-0000-0000-0000000000e7', 'Núcleo 8 a 14', 'faixa-h2@test.dev', true),
  ('e8000000-0000-0000-0000-0000000000e8', 'Empresário', 'faixa-m@test.dev', true),
  ('e9000000-0000-0000-0000-0000000000e9', 'Olheiro', 'faixa-o@test.dev', true),
  ('ea000000-0000-0000-0000-0000000000ea', 'Marca', 'faixa-b@test.dev', true);
update profiles set role = 'ADMIN' where id = 'e2000000-0000-0000-0000-0000000000e2';

-- ================================================================ 1. cadastro de 6 a 22
select pg_temp.as_user('e1000000-0000-0000-0000-0000000000e1');
select throws_ok($$ select create_athlete('Muito Novo', '', (current_date - interval '6 years' + interval '1 day')::date, 'BR', 'mother') $$,
  'P0001', 'age out of range', 'menos de 6 anos: recusado');
select throws_ok($$ select create_athlete('Muito Velho', '', (current_date - interval '23 years')::date, 'BR', 'mother') $$,
  'P0001', 'age out of range', '23 anos: recusado');
insert into ids values ('a6',  create_athlete('Seis Anos', 'Seis', (current_date - interval '6 years')::date, 'BR', 'mother'));
insert into ids values ('a10', create_athlete('Dez Anos', 'Dez', (current_date - interval '10 years')::date, 'BR', 'mother'));
insert into ids values ('a11', create_athlete('Onze Anos', 'Onze', (current_date - interval '11 years')::date, 'BR', 'mother'));
insert into ids values ('a14', create_athlete('Quatorze Anos', 'Quatorze', (current_date - interval '14 years')::date, 'BR', 'mother'));
insert into ids values ('a15', create_athlete('Quinze Anos', 'Quinze', (current_date - interval '15 years')::date, 'BR', 'mother'));
insert into ids values ('a22', create_athlete('Vinte e Dois', 'Vinte', (current_date - interval '23 years' + interval '1 day')::date, 'BR', 'mother'));
select is((select count(*)::int from ids), 6, '6 e 22 anos (até a véspera dos 23) são aceitos');
select throws_ok(format($$ update athletes set birth_date = (current_date - interval '5 years')::date where id = %L $$, pg_temp.id('a6')),
  'P0001', 'age out of range', 'trocar a data para fora da faixa: recusado');
select lives_ok(format($$ update athletes set sport_name = 'Seisinho' where id = %L $$, pg_temp.id('a6')), 'outras edições seguem livres');
insert into athlete_media (athlete_id, kind, url, external_id)
  select id, 'youtube', 'https://www.youtube.com/watch?v=abcdefghijk', 'abcdefghijk' from ids where k in ('a10', 'a11');
select pg_temp.as_service();
update athletes set status = 'approved', approved_at = now() where id in (select id from ids);

-- ================================================================ 2. organizações
create function pg_temp.pro(p_user uuid, p_kind text, p_k text) returns void language plpgsql as $$
begin
  perform pg_temp.as_user(p_user);
  insert into ids values (p_k, complete_professional_signup('+5511977770000', 'BR', 'pt-BR', array['terms', 'privacy', 'pro_conduct'], 'v',
    json_build_object('name', 'Org ' || p_k, 'kind', p_kind, 'document', '12.345.678/0001-90', 'contact_role', 'Diretor')::jsonb));
end $$;
select pg_temp.pro('e3000000-0000-0000-0000-0000000000e3', 'school', 'S');
select pg_temp.pro('e4000000-0000-0000-0000-0000000000e4', 'school', 'S2');
select pg_temp.pro('e5000000-0000-0000-0000-0000000000e5', 'club', 'C');
select pg_temp.pro('e6000000-0000-0000-0000-0000000000e6', 'scouting_hub', 'H');
select pg_temp.pro('e7000000-0000-0000-0000-0000000000e7', 'scouting_hub', 'H2');
select pg_temp.pro('e8000000-0000-0000-0000-0000000000e8', 'manager', 'M');
select pg_temp.pro('e9000000-0000-0000-0000-0000000000e9', 'scout', 'O');
-- marca: o cadastro público não oferece o tipo; criada direto para testar o piso de 18
select pg_temp.as_owner();
insert into organizations (id, name, kind, country, status) values ('ab000000-0000-0000-0000-0000000000ab', 'Marca Teste', 'brand', 'BR', 'approved');
insert into organization_members (organization_id, profile_id, is_owner) values ('ab000000-0000-0000-0000-0000000000ab', 'ea000000-0000-0000-0000-0000000000ea', true);
update profiles set role = 'PROFESSIONAL' where id = 'ea000000-0000-0000-0000-0000000000ea';
insert into ids values ('B', 'ab000000-0000-0000-0000-0000000000ab');

select pg_temp.as_admin('e2000000-0000-0000-0000-0000000000e2');
select admin_review_organization(id, 'approve') from ids where k in ('S', 'S2', 'C', 'H', 'H2', 'M', 'O');

-- ================================================================ 3. faixas pelo admin
select throws_ok(format($$ select admin_set_org_age_band(%L, 6, 22, null) $$, pg_temp.id('S2')), 'P0001', 'note required', 'faixa exige motivo');
select throws_ok(format($$ select admin_set_org_age_band(%L, 10, 22, 'pedido do empresário') $$, pg_temp.id('M')), 'P0001', 'invalid band',
  'empresário: nunca abaixo de 15');
select throws_ok(format($$ select admin_set_org_age_band(%L, 12, 22, 'marca') $$, pg_temp.id('B')), 'P0001', 'invalid band', 'marca: nunca menores');
select throws_ok(format($$ select admin_set_org_age_band(%L, 8, 23, 'núcleo') $$, pg_temp.id('H2')), 'P0001', 'invalid band', 'máximo de 22');
select lives_ok(format($$ select admin_set_org_age_band(%L, 6, 22, 'escolinha com sub-7 e sub-9 verificada') $$, pg_temp.id('S2')),
  'admin autoriza a escolinha a partir de 6');
select lives_ok(format($$ select admin_set_org_age_band(%L, 8, 14, 'núcleo regional de 8 a 14 verificado') $$, pg_temp.id('H2')),
  'admin autoriza o núcleo de 8 a 14');
select is((select count(*)::int from audit_log where action = 'organization.age_band'), 2, 'faixas ficam na auditoria');
select pg_temp.as_user('e5000000-0000-0000-0000-0000000000e5');
select throws_ok(format($$ select admin_set_org_age_band(%L, 6, 22, 'quero ver crianças') $$, pg_temp.id('C')), 'P0001', 'not allowed',
  'profissional não muda a própria faixa');
update organizations set athlete_age_min = 6, athlete_age_max = 22 where id = pg_temp.id('C');
select pg_temp.as_owner();
select ok((select athlete_age_min is null from organizations where id = pg_temp.id('C')), 'nem direto na tabela (a alteração é ignorada)');

-- ================================================================ 4. quem vê quem (pela idade de hoje)
create function pg_temp.visible(p_user uuid) returns text language plpgsql as $$
declare v text;
begin
  perform pg_temp.as_user(p_user);
  select string_agg(replace(k, 'a', ''), ',' order by length(k), k) into v from ids where k like 'a%' and athlete_visible_to_pro(id);
  return coalesce(v, '');
end $$;
select is(pg_temp.visible('e3000000-0000-0000-0000-0000000000e3'), '11,14,15,22', 'escolinha sem autorização: de 11 a 22');
select is(pg_temp.visible('e4000000-0000-0000-0000-0000000000e4'), '6,10,11,14,15,22', 'escolinha autorizada: de 6 a 22');
select is(pg_temp.visible('e5000000-0000-0000-0000-0000000000e5'), '11,14,15,22', 'clube sem autorização: de 11 a 22');
select is(pg_temp.visible('e6000000-0000-0000-0000-0000000000e6'), '', 'núcleo sem faixa: ninguém');
select is(pg_temp.visible('e7000000-0000-0000-0000-0000000000e7'), '10,11,14', 'núcleo autorizado de 8 a 14');
select is(pg_temp.visible('e8000000-0000-0000-0000-0000000000e8'), '15,22', 'empresário: a partir de 15');
select is(pg_temp.visible('e9000000-0000-0000-0000-0000000000e9'), '11,14,15,22', 'olheiro: a partir de 11');
select is(pg_temp.visible('ea000000-0000-0000-0000-0000000000ea'), '22', 'marca: nenhum menor de idade');

select pg_temp.as_user('e8000000-0000-0000-0000-0000000000e8');
select is((select count(*)::int from pro_search_athletes()), 2, 'busca do empresário traz só 15 e 22');
select throws_ok(format($$ select pro_athlete_profile(%L) $$, pg_temp.id('a14')), 'P0001', 'not found', 'empresário não abre ficha de 14 anos');
select throws_ok(format($$ select pro_send_interest(%L, 'Gostaria de conversar com a família.') $$, pg_temp.id('a14')), 'P0001', 'not found',
  'nem envia interesse');
select is((select count(*)::int from athletes), 0, 'tabela de atletas continua fechada para o profissional');
select pg_temp.as_user('e4000000-0000-0000-0000-0000000000e4');
select is((select age_min::text || '-' || age_max from pro_age_bands()), '6-22', 'escolinha vê a própria faixa');

-- ================================================================ 5. aos 23 sai da busca, a família continua vendo
select pg_temp.as_owner();
alter table athletes disable trigger athletes_age_range;
update athletes set birth_date = (current_date - interval '23 years')::date where id = pg_temp.id('a22');
alter table athletes enable trigger athletes_age_range;
select is(pg_temp.visible('e4000000-0000-0000-0000-0000000000e4'), '6,10,11,14,15', 'fez 23: some para a escolinha');
select is(pg_temp.visible('ea000000-0000-0000-0000-0000000000ea'), '', 'e para a marca');
select pg_temp.as_user('e1000000-0000-0000-0000-0000000000e1');
select is((select count(*)::int from athletes where id = pg_temp.id('a22')), 1, 'a família continua vendo o perfil');
select lives_ok(format($$ update athletes set sport_name = 'Vintão' where id = %L $$, pg_temp.id('a22')), 'e editando (sem mudar a data)');

-- ================================================================ 6. interesse com finalidade
select pg_temp.as_user('e4000000-0000-0000-0000-0000000000e4');
select lives_ok(format($$ insert into ids values ('i1', pro_send_proposal(%L, 'Temos uma bolsa integral na nossa escolinha.', 'scholarship_100')) $$, pg_temp.id('a6')),
  'escolinha autorizada oferece bolsa de 100% para 6 anos');
select throws_ok(format($$ select pro_send_proposal(%L, 'Bolsa: ligue 11 99999-0000 agora', 'scholarship_50') $$, pg_temp.id('a10')), 'P0001', 'message contact',
  'mesma regra: nada de telefone na mensagem');
select throws_ok(format($$ select pro_send_proposal(%L, 'Proposta qualquer para a família', 'bolsa') $$, pg_temp.id('a10')), 'P0001', 'invalid purpose',
  'finalidade fora da lista');
select pg_temp.as_user('e5000000-0000-0000-0000-0000000000e5');
select throws_ok(format($$ select pro_send_proposal(%L, 'Bolsa no nosso clube para o atleta.', 'scholarship_50') $$, pg_temp.id('a14')), 'P0001', 'purpose not allowed',
  'clube não oferece bolsa de escolinha');
select lives_ok(format($$ insert into ids values ('i2', pro_send_proposal(%L, 'Convite para avaliação no clube.', 'evaluation_invite')) $$, pg_temp.id('a14')),
  'clube convida para avaliação');
select pg_temp.as_user('e8000000-0000-0000-0000-0000000000e8');
select throws_ok(format($$ select pro_send_proposal(%L, 'Convite para avaliação comigo.', 'evaluation_invite') $$, pg_temp.id('a15')), 'P0001', 'purpose not allowed',
  'empresário não convida para avaliação');
select pg_temp.as_user('e1000000-0000-0000-0000-0000000000e1');
select is((select string_agg(purpose, ',' order by purpose) from interest_purposes(array[pg_temp.id('i1'), pg_temp.id('i2')])), 'evaluation_invite,scholarship_100',
  'a família vê a finalidade de cada interesse');
select is((select status from guardian_interests() where id = pg_temp.id('i1')), 'requested', 'e decide: o interesse chega como pedido');
select ok((select org_contact from guardian_interests() where id = pg_temp.id('i1')) is null, 'contato da escolinha só depois de aceitar');
select pg_temp.as_user('e5000000-0000-0000-0000-0000000000e5');
select is((select count(*)::int from interest_purposes(array[pg_temp.id('i1'), pg_temp.id('i2')])), 1, 'cada organização só vê os próprios');

-- ================================================================ 7. membro de duas organizações grava pela certa
select pg_temp.as_owner();
insert into organization_members (organization_id, profile_id, is_owner) values (pg_temp.id('M'), 'e4000000-0000-0000-0000-0000000000e4', false);
select pg_temp.as_user('e4000000-0000-0000-0000-0000000000e4');
select throws_ok(format($$ insert into pro_notes (organization_id, athlete_id, author_id, body) values (%L, %L, %L, 'nota pela empresa errada') $$,
  pg_temp.id('M'), pg_temp.id('a10'), 'e4000000-0000-0000-0000-0000000000e4'), 'P0001', 'age not allowed',
  'nota sobre criança pela organização do empresário: recusada');
select lives_ok(format($$ insert into pro_notes (organization_id, athlete_id, author_id, body) values (%L, %L, %L, 'observação formativa') $$,
  pg_temp.id('S2'), pg_temp.id('a10'), 'e4000000-0000-0000-0000-0000000000e4'), 'pela escolinha autorizada: aceita');

-- ================================================================ 8. fase formativa (6 a 10): sem notas
select throws_ok(format($$ insert into scout_evaluations (organization_id, athlete_id, author_id, rubric_version, position_group, scores)
  values (%L, %L, %L, 'r', 'st', '{"finishing": 4}') $$, pg_temp.id('S2'), pg_temp.id('a10'), 'e4000000-0000-0000-0000-0000000000e4'),
  'P0001', 'formative age', 'avaliação com notas para 10 anos: recusada');
select lives_ok(format($$ insert into scout_evaluations (organization_id, athlete_id, author_id, rubric_version, position_group, scores)
  values (%L, %L, %L, 'r', 'st', '{"finishing": 4}') $$, pg_temp.id('S2'), pg_temp.id('a11'), 'e4000000-0000-0000-0000-0000000000e4'),
  'para 11 anos: aceita');
select pg_temp.as_admin('e2000000-0000-0000-0000-0000000000e2');
select admin_ai_grant(id, 1, 'cortesia de teste') from ids where k in ('a10', 'a11');
select pg_temp.as_user('e1000000-0000-0000-0000-0000000000e1');
select throws_ok(format($$ select request_ai_analysis(%L, 'highlights', 4, 9, 'azul', 'ST', 'v1', 'r1', 'p1') $$,
  (select id from athlete_media where athlete_id = pg_temp.id('a10'))), 'P0001', 'formative age', 'análise por IA com notas para 10 anos: bloqueada');
select lives_ok(format($$ select request_ai_analysis(%L, 'highlights', 4, 9, 'azul', 'ST', 'v1', 'r1', 'p1') $$,
  (select id from athlete_media where athlete_id = pg_temp.id('a11'))), 'para 11 anos: permitida');

select pg_temp.as_owner();
select * from finish();
rollback;
