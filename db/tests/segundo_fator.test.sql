-- Segundo fator dos administradores (0010): sem a prova do segundo fator, o papel ADMIN
-- não abre nada; operações do segundo fator só pelo servidor. Tudo dentro de begin/rollback.
begin;
create extension if not exists pgtap;
select no_plan();

create function pg_temp.as_user(p_id uuid, p_mfa text default null) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', (json_build_object('sub', p_id, 'role', 'authenticated')::jsonb
    || case when p_mfa is null then '{}'::jsonb else jsonb_build_object('vp_mfa', p_mfa) end)::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;
create function pg_temp.h(t text) returns text language sql immutable as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;

insert into neon_auth."user" (id, name, email, "emailVerified") values
  ('ad000000-0000-0000-0000-0000000000a1', 'Admin MFA', 'mfa-admin@test.dev', true),
  ('ad000000-0000-0000-0000-0000000000b1', 'Família MFA', 'mfa-g@test.dev', true);
update profiles set role = 'ADMIN' where id = 'ad000000-0000-0000-0000-0000000000a1';
create temp table ids (k text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
select pg_temp.as_user('ad000000-0000-0000-0000-0000000000b1');
insert into ids values ('ath', create_athlete('Atleta Mfa', 'Mfa', '2011-01-01', 'BR', 'mother'));

-- ================================================================ só a senha não basta
select pg_temp.as_user('ad000000-0000-0000-0000-0000000000a1');
select is(is_admin(), false, 'papel ADMIN sem segundo fator não é admin');
select is((select count(*)::int from profiles), 1, 'sem segundo fator, o admin não lê perfis de terceiros');
select is((select count(*)::int from athletes), 0, 'nem atletas');
select throws_ok(format($$ select admin_review_athlete(%L, 'approve') $$, (select id from ids where k = 'ath')), 'P0001', 'not allowed', 'nem decide revisões');
select pg_temp.as_user('ad000000-0000-0000-0000-0000000000a1', 'token-inventado');
select is(is_admin(), false, 'prova inventada não vale');

-- ================================================================ operações só pelo servidor
select throws_ok($$ select mfa_state('ad000000-0000-0000-0000-0000000000a1') $$, '42501', null, 'navegador/Data API não consulta o segundo fator');
select throws_ok($$ select mfa_open_session('ad000000-0000-0000-0000-0000000000a1', 1, repeat('a', 64)) $$, '42501', null, 'nem abre sessão');
select throws_ok($$ select * from admin_mfa_sessions $$, '42501', null, 'nem lê as sessões');
select throws_ok($$ select * from admin_mfa $$, '42501', null, 'nem lê o segredo cifrado');

select pg_temp.as_service();
select throws_ok($$ select mfa_state('ad000000-0000-0000-0000-0000000000b1') $$, 'P0001', 'not admin', 'só contas ADMIN têm segundo fator');
select lives_ok($$ select mfa_begin_enroll('ad000000-0000-0000-0000-0000000000a1', 'cifrado-1', false) $$, 'servidor inicia o cadastro do fator');
select is(mfa_state('ad000000-0000-0000-0000-0000000000a1')->>'pending', 'true', 'cadastro pendente até o primeiro código');
select throws_ok($$ select mfa_open_session('ad000000-0000-0000-0000-0000000000a1', 100, pg_temp.h('t1')) $$, 'P0001', 'recovery codes required',
  'ativar exige os 10 códigos de recuperação');
select lives_ok($$ select mfa_open_session('ad000000-0000-0000-0000-0000000000a1', 100, pg_temp.h('t1'),
  array(select pg_temp.h('rec' || g) from generate_series(1, 10) g)) $$, 'primeiro código ativa o fator e abre a sessão');
select is(mfa_state('ad000000-0000-0000-0000-0000000000a1')->>'enrolled', 'true', 'fator ativo');
select throws_ok($$ select mfa_begin_enroll('ad000000-0000-0000-0000-0000000000a1', 'cifrado-2', false) $$, 'P0001', 'already enrolled',
  'trocar o fator exige estar verificado');
select throws_ok($$ select mfa_open_session('ad000000-0000-0000-0000-0000000000a1', 100, pg_temp.h('t2')) $$, 'P0001', 'code reused', 'mesmo código não vale duas vezes');

select pg_temp.as_user('ad000000-0000-0000-0000-0000000000a1', 't1');
select is(is_admin(), true, 'com a prova do segundo fator, é admin');
select ok((select count(*)::int from profiles) >= 2, 'e lê os perfis');
select lives_ok(format($$ select admin_request_correction(%L, 'Teste com segundo fator') $$, (select id from ids where k = 'ath')), 'e age como admin');

-- bloqueio após 5 erros
select pg_temp.as_service();
select mfa_register_failure('ad000000-0000-0000-0000-0000000000a1') from generate_series(1, 5);
select ok((mfa_state('ad000000-0000-0000-0000-0000000000a1')->>'locked_until')::timestamptz > now(), '5 erros seguidos: espera de 15 minutos');
select throws_ok($$ select mfa_open_session('ad000000-0000-0000-0000-0000000000a1', 101, pg_temp.h('t3')) $$, 'P0001', 'locked', 'bloqueado, nem código certo entra');
update admin_mfa set locked_until = null;

-- recuperação: uso único
select is(mfa_use_recovery('ad000000-0000-0000-0000-0000000000a1', pg_temp.h('rec3'), pg_temp.h('t4')), 9, 'código de recuperação abre a sessão');
select throws_ok($$ select mfa_use_recovery('ad000000-0000-0000-0000-0000000000a1', pg_temp.h('rec3'), pg_temp.h('t5')) $$, 'P0001', 'invalid code',
  'código de recuperação é de uso único');

-- sessão expira e é encerrada no sair
update admin_mfa_sessions set expires_at = now() - interval '1 minute' where token_hash = pg_temp.h('t1');
select pg_temp.as_user('ad000000-0000-0000-0000-0000000000a1', 't1');
select is(is_admin(), false, 'sessão de segundo fator expira (8 h)');
select pg_temp.as_service();
select mfa_close_session(pg_temp.h('t4'));
select pg_temp.as_user('ad000000-0000-0000-0000-0000000000a1', 't4');
select is(is_admin(), false, 'sair encerra a sessão de segundo fator');

reset role;
select * from finish();
rollback;
