-- Testes de isolamento (pgTAP). Rodar: npx supabase test db
-- Cenário: responsáveis A e B; profissionais P1 (org1) e P2 (org2) aprovados;
-- P3 em organização pendente; anônimo.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ---------------------------------------------------------------- helpers
create function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;

-- ---------------------------------------------------------------- dados
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-00000000000a', 'a@test.dev', '{"full_name":"Resp A","whatsapp":"+5511999990001","consents":["terms","privacy","guardian_declaration"],"consent_version":"2026-10"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'b@test.dev', '{"full_name":"Resp B","whatsapp":"+5511999990002"}'),
  ('c0000000-0000-0000-0000-0000000000c1', 'p1@test.dev', '{"full_name":"Pro 1"}'),
  ('c0000000-0000-0000-0000-0000000000c2', 'p2@test.dev', '{"full_name":"Pro 2"}'),
  ('c0000000-0000-0000-0000-0000000000c3', 'p3@test.dev', '{"full_name":"Pro 3"}');

select is((select count(*)::int from profiles), 5, 'trigger cria profile para cada conta');
select is((select role::text from profiles where id = 'a0000000-0000-0000-0000-00000000000a'), 'RESPONSIBLE', 'nova conta é sempre RESPONSIBLE');
select is((select count(*)::int from consents where profile_id = 'a0000000-0000-0000-0000-00000000000a'), 3, 'consentimentos do cadastro registrados');

update profiles set role = 'PROFESSIONAL' where email in ('p1@test.dev', 'p2@test.dev', 'p3@test.dev');
insert into organizations (id, name, kind, country, status) values
  ('d0000000-0000-0000-0000-0000000000d1', 'Clube Alfa', 'club', 'BR', 'approved'),
  ('d0000000-0000-0000-0000-0000000000d2', 'Agência Beta', 'agent', 'BR', 'approved'),
  ('d0000000-0000-0000-0000-0000000000d3', 'Clube Pendente', 'club', 'BR', 'pending');
insert into organization_members (organization_id, profile_id) values
  ('d0000000-0000-0000-0000-0000000000d1', 'c0000000-0000-0000-0000-0000000000c1'),
  ('d0000000-0000-0000-0000-0000000000d2', 'c0000000-0000-0000-0000-0000000000c2'),
  ('d0000000-0000-0000-0000-0000000000d3', 'c0000000-0000-0000-0000-0000000000c3');

-- ---------------------------------------------------------------- criação de atletas
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
create temp table ids (k text primary key, id uuid) on commit drop;
grant all on ids to authenticated, anon;
insert into ids values ('athA', create_athlete('Atleta Um', 'Um', '2011-03-10', 'BR'));
select throws_ok($$ insert into athletes (full_name, birth_date, country) values ('X', '2011-01-01', 'BR') $$,
  '42501', null, 'responsável não insere atleta direto (só via create_athlete)');

select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
insert into ids values ('athB', create_athlete('Atleta Dois', 'Dois', '2010-07-01', 'BR'));

-- ---------------------------------------------------------------- A × B: isolamento total
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from athletes), 1, 'A lista apenas o próprio atleta');
select is((select count(*)::int from athletes where id = (select id from ids where k = 'athB')), 0, 'A não lê o atleta de B');
select is((select count(*)::int from athlete_guardians), 1, 'A só vê o próprio vínculo');
select is((select count(*)::int from profiles), 1, 'A não lê perfil/contato de B');

with u as (update athletes set bio = 'hack' where id = (select id from ids where k = 'athB') returning 1)
select is((select count(*)::int from u), 0, 'A não edita o atleta de B');
select throws_ok(format($$ insert into athlete_media (athlete_id, kind, storage_path) values (%L, 'photo', 'x/y.webp') $$, (select id from ids where k = 'athB')),
  '42501', null, 'A não adiciona mídia ao atleta de B');
select throws_ok(format($$ insert into athlete_org_blocks (athlete_id, organization_id) values (%L, 'd0000000-0000-0000-0000-0000000000d1') $$, (select id from ids where k = 'athB')),
  '42501', null, 'A não bloqueia organizações pelo atleta de B');
select throws_ok(format($$ insert into storage.objects (bucket_id, name, owner_id) values ('athlete-photos', %L, auth.uid()::text) $$, (select id from ids where k = 'athB') || '/f.webp'),
  '42501', null, 'A não envia foto para a pasta do atleta de B');
select lives_ok(format($$ insert into storage.objects (bucket_id, name, owner_id) values ('athlete-photos', %L, auth.uid()::text) $$, (select id from ids where k = 'athA') || '/f.webp'),
  'A envia foto para a pasta do próprio atleta');
select is((select count(*)::int from athlete_activity_signals((select id from ids where k = 'athB'))), 0, 'A não lê sinais do atleta de B');

-- ---------------------------------------------------------------- status e pagamento
select throws_ok(format($$ update athletes set status = 'approved' where id = %L $$, (select id from ids where k = 'athA')),
  null, 'mudança de status não permitida', 'responsável não aprova o próprio atleta');
select lives_ok(format($$ update athletes set status = 'pending_payment' where id = %L $$, (select id from ids where k = 'athA')),
  'rascunho → aguardando pagamento');
select throws_ok(format($$ update athletes set status = 'in_review' where id = %L $$, (select id from ids where k = 'athA')),
  null, 'mudança de status não permitida', 'sem pagamento não vai para revisão');
select throws_ok($$ select mark_payment_paid(gen_random_uuid(), 'x', 'y') $$, '42501', null, 'responsável não confirma pagamento');

-- confirmação real só por service role (webhook): paga, vai para revisão; admin aprova
select pg_temp.as_service();
insert into payments (id, athlete_id, payer_id) values ('e0000000-0000-0000-0000-0000000000e1', (select id from ids where k = 'athA'), 'a0000000-0000-0000-0000-00000000000a');
select mark_payment_paid('e0000000-0000-0000-0000-0000000000e1', 'test', 'ref');
select is((select status::text from athletes where id = (select id from ids where k = 'athA')), 'in_review', 'pagamento confirmado → em revisão');
select throws_ok($$ insert into payments (athlete_id, payer_id, status) select id, 'a0000000-0000-0000-0000-00000000000a', 'paid' from ids where k = 'athA' $$,
  '23505', null, 'pagamento único por atleta');
update athletes set status = 'approved', approved_at = now() where id = (select id from ids where k = 'athA');
insert into athlete_media (athlete_id, kind, storage_path, is_primary) select id, 'photo', id || '/p.webp', true from ids where k = 'athA';

-- ---------------------------------------------------------------- visibilidade para profissionais
select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from athletes), 1, 'P1 vê apenas atleta aprovado e ativo');
select is((select count(*)::int from athletes where id = (select id from ids where k = 'athB')), 0, 'P1 não vê atleta em rascunho');
select is((select count(*)::int from athlete_media), 1, 'P1 vê mídia do atleta visível');
select is((select count(*)::int from profiles), 1, 'P1 não lê contato de responsáveis');
select is((select count(*)::int from athlete_guardians), 0, 'P1 não lê vínculos responsável ↔ atleta');

select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c3');
select is((select count(*)::int from athletes), 0, 'membro de organização pendente não vê atletas');
select pg_temp.as_anon();
select is((select count(*)::int from athletes), 0, 'anônimo não vê atletas');
select is((select count(*)::int from search_organizations('Clube')), 0, 'anônimo não busca organizações');

-- pausado / oculto
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
update athletes set visibility = 'paused' where id = (select id from ids where k = 'athA');
select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from athletes), 0, 'perfil pausado some para profissionais');
select is((select count(*)::int from athlete_media), 0, 'mídia de perfil pausado some para profissionais');
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
update athletes set visibility = 'hidden' where id = (select id from ids where k = 'athA');
select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from athletes), 0, 'perfil oculto some para profissionais');
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
update athletes set visibility = 'active' where id = (select id from ids where k = 'athA');

-- ---------------------------------------------------------------- bloqueio de organização
select is((select count(*)::int from search_organizations('Clube')), 1, 'busca retorna só organizações aprovadas');
select is((select count(*)::int from search_organizations('Cl')), 0, 'busca exige 3+ letras');
insert into athlete_org_blocks (athlete_id, organization_id) select id, 'd0000000-0000-0000-0000-0000000000d1' from ids where k = 'athA';
select is((select count(*)::int from athlete_blocked_organizations((select id from ids where k = 'athA'))), 1, 'responsável vê a organização ocultada');

select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from athletes), 0, 'organização bloqueada não encontra o atleta');
select is((select count(*)::int from athlete_media), 0, 'organização bloqueada não vê mídia');
select is((select count(*)::int from athlete_org_blocks), 0, 'organização não descobre o bloqueio');
select is((select count(*)::int from storage.objects where bucket_id = 'athlete-photos'), 0, 'organização bloqueada não lê fotos no Storage');
select throws_ok(format($$ insert into athlete_views (athlete_id, viewer_id) values (%L, auth.uid()) $$, (select id from ids where k = 'athA')),
  '42501', null, 'organização bloqueada não registra visualização');
select throws_ok(format($$ insert into contact_requests (athlete_id, organization_id, requested_by, message) values (%L, 'd0000000-0000-0000-0000-0000000000d1', auth.uid(), 'oi') $$, (select id from ids where k = 'athA')),
  '42501', null, 'organização bloqueada não solicita contato');
select throws_ok(format($$ insert into pro_favorites (profile_id, athlete_id) values (auth.uid(), %L) $$, (select id from ids where k = 'athA')),
  '42501', null, 'organização bloqueada não favorita');

select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c2');
select is((select count(*)::int from athletes), 1, 'outra organização continua vendo o atleta');
select lives_ok(format($$ insert into athlete_views (athlete_id, viewer_id, kind, source) values (%L, auth.uid(), 'view', 'profile_page') $$, (select id from ids where k = 'athA')),
  'profissional autorizado registra visualização');
select is((select count(*)::int from storage.objects where bucket_id = 'athlete-photos'), 1, 'profissional autorizado lê a foto via Storage');

-- ---------------------------------------------------------------- sinais para o responsável (sem números)
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select is((select array_agg(kind::text) from athlete_activity_signals((select id from ids where k = 'athA'))), array['view'], 'responsável recebe o sinal de visualização');
select is((select count(*)::int from athlete_views), 0, 'responsável não lê eventos brutos (quem/quantos)');
select has_function('public', 'athlete_activity_signals', array['uuid'], 'sinais expostos só por função');

-- ---------------------------------------------------------------- fotos: principal única e limite
select pg_temp.as_service();
insert into athlete_media (athlete_id, kind, storage_path) select id, 'photo', id || '/g' || n || '.webp' from ids, generate_series(1, 11) n where k = 'athA';
select throws_ok($$ insert into athlete_media (athlete_id, kind, storage_path) select id, 'photo', id || '/g13.webp' from ids where k = 'athA' $$,
  null, 'photo limit reached', 'limite de 12 fotos');
select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
select throws_ok(format($$ select set_primary_photo((select id from athlete_media where storage_path = %L)) $$, (select id from ids where k = 'athA') || '/g1.webp'),
  null, 'not allowed', 'B não altera a foto principal de A');

select * from finish();
rollback;
