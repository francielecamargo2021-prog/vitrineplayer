-- Limite de tentativas (0013): contadores compartilhados no banco, só pelo servidor,
-- sem e-mail/IP em texto. Tudo dentro de begin/rollback.
begin;
create extension if not exists pgtap;
select no_plan();

create function pg_temp.as_service() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;
create function pg_temp.as_user() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.k(t text) returns text language sql immutable as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;

-- ================================================================ acesso
select pg_temp.as_user();
select throws_ok(format($$ select auth_limit_check(array[%L]) $$, pg_temp.k('a')), '42501', null, 'navegador/Data API não consulta os contadores');
select throws_ok(format($$ select auth_limit_hit(%L, 'signin_pair', 5, 900, 900) $$, pg_temp.k('a')), '42501', null, 'nem registra tentativas');
select throws_ok(format($$ select auth_limit_clear(array[%L]) $$, pg_temp.k('a')), '42501', null, 'nem zera contadores');
select throws_ok($$ select count(*) from auth_attempts $$, '42501', null, 'nem lê a tabela');
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(format($$ select auth_limit_hit(%L, 'signin_pair', 5, 900, 900) $$, pg_temp.k('a')), 'P0001', 'not allowed', 'sem papel de serviço, a função recusa');

-- ================================================================ chave só em hash
select pg_temp.as_service();
select throws_ok($$ select auth_limit_hit('fulano@email.com', 'signin_pair', 5, 900, 900) $$, '23514', null, 'e-mail em texto não é aceito como chave');
select throws_ok(format($$ select auth_limit_hit(%L, 'signin_pair', 0, 900, 900) $$, pg_temp.k('a')), 'P0001', 'invalid limit', 'limite inválido recusado');

-- ================================================================ contagem e bloqueio
select is((auth_limit_check(array[pg_temp.k('a')]) ->> 'blocked')::boolean, false, 'sem tentativas, sem bloqueio');
select is((auth_limit_hit(pg_temp.k('a'), 'signin_pair', 3, 900, 900) ->> 'hits')::int, 1, '1ª tentativa contada');
select is((auth_limit_hit(pg_temp.k('a'), 'signin_pair', 3, 900, 900) ->> 'hits')::int, 2, '2ª tentativa contada');
select is((auth_limit_check(array[pg_temp.k('a')]) ->> 'blocked')::boolean, false, 'abaixo do limite, ainda livre');
select is((auth_limit_hit(pg_temp.k('a'), 'signin_pair', 3, 900, 900) ->> 'blocked')::boolean, true, '3ª tentativa bloqueia');
select ok((auth_limit_check(array[pg_temp.k('x'), pg_temp.k('a')]) ->> 'retry_after')::int between 890 and 900, 'espera de ~15 min informada');
select is(auth_limit_check(array[pg_temp.k('x'), pg_temp.k('a')]) ->> 'scope', 'signin_pair', 'escopo do bloqueio informado');
select is((select strikes from auth_attempts where key = pg_temp.k('a'))::int, 1, 'primeiro bloqueio registrado');
select is((auth_limit_check(array[pg_temp.k('b')]) ->> 'blocked')::boolean, false, 'outra chave não é afetada');

-- janela vencida recomeça a contagem
select auth_limit_hit(pg_temp.k('b'), 'signin_ip', 3, 900, 900);
select auth_limit_hit(pg_temp.k('b'), 'signin_ip', 3, 900, 900);
update auth_attempts set window_start = now() - interval '16 minutes' where key = pg_temp.k('b');
select is((auth_limit_hit(pg_temp.k('b'), 'signin_ip', 3, 900, 900) ->> 'hits')::int, 1, 'depois da janela, a contagem recomeça');

-- bloqueio vence; reincidência com escalonamento dobra a espera
update auth_attempts set blocked_until = now() - interval '1 second' where key = pg_temp.k('a');
select is((auth_limit_check(array[pg_temp.k('a')]) ->> 'blocked')::boolean, false, 'bloqueio vencido libera');
select auth_limit_hit(pg_temp.k('a'), 'signin_pair', 3, 900, 900, true);
select auth_limit_hit(pg_temp.k('a'), 'signin_pair', 3, 900, 900, true);
select ok((auth_limit_hit(pg_temp.k('a'), 'signin_pair', 3, 900, 900, true) ->> 'retry_after')::int between 1790 and 1800, 'reincidência: espera dobrada (30 min)');
update auth_attempts set blocked_until = now() - interval '1 second', strikes = 10 where key = pg_temp.k('a');
select auth_limit_hit(pg_temp.k('a'), 'signin_pair', 3, 900, 900, true);
select auth_limit_hit(pg_temp.k('a'), 'signin_pair', 3, 900, 900, true);
select ok((auth_limit_hit(pg_temp.k('a'), 'signin_pair', 3, 900, 900, true) ->> 'retry_after')::int between 7190 and 7200, 'escalonamento limitado a 8× (2 h)');

-- sem escalonamento (escopo por e-mail: contra bloqueio abusivo da conta de outra pessoa)
select auth_limit_hit(pg_temp.k('c'), 'signin_email', 2, 3600, 3600);
select auth_limit_hit(pg_temp.k('c'), 'signin_email', 2, 3600, 3600);
update auth_attempts set blocked_until = now() - interval '1 second', strikes = 5 where key = pg_temp.k('c');
select auth_limit_hit(pg_temp.k('c'), 'signin_email', 2, 3600, 3600);
select ok((auth_limit_hit(pg_temp.k('c'), 'signin_email', 2, 3600, 3600) ->> 'retry_after')::int between 3590 and 3600, 'sem escalonamento, a espera não cresce');

-- sucesso zera as chaves informadas
select auth_limit_clear(array[pg_temp.k('a'), pg_temp.k('c')]);
select is((select count(*)::int from auth_attempts where key in (pg_temp.k('a'), pg_temp.k('c'))), 0, 'sucesso zera as chaves informadas');
select is((select count(*)::int from auth_attempts where key = pg_temp.k('b')), 1, 'e só elas');

-- limpeza de linhas antigas sem bloqueio vigente
insert into auth_attempts (key, scope, hits, updated_at) values (pg_temp.k('velha'), 'otp_send', 1, now() - interval '2 days');
insert into auth_attempts (key, scope, hits, updated_at, blocked_until) values (pg_temp.k('presa'), 'otp_send', 1, now() - interval '2 days', now() + interval '1 hour');
select auth_limit_hit(pg_temp.k('d'), 'otp_send', 5, 3600, 3600);
select is((select count(*)::int from auth_attempts where key = pg_temp.k('velha')), 0, 'linha parada há mais de 1 dia é apagada');
select is((select count(*)::int from auth_attempts where key = pg_temp.k('presa')), 1, 'bloqueio vigente é mantido');

-- concorrência: incremento atômico (mesma chave, várias chamadas na mesma transação)
select auth_limit_hit(pg_temp.k('e'), 'signup_ip', 100, 3600, 3600) from generate_series(1, 20);
select is((select hits from auth_attempts where key = pg_temp.k('e')), 20, 'nenhuma tentativa perdida');

select * from finish();
rollback;
