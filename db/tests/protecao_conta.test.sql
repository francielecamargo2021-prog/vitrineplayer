-- Proteção de login (0014): contagem atômica, proteção por conta, aparelhos reconhecidos e
-- espera entre envios. Só o servidor chama. Tudo dentro de begin/rollback.
-- A simultaneidade real (50 pedidos paralelos) é testada em db/tests/local/simultaneidade.mjs.
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
create function pg_temp.item(k text, scope text, mx int, win int default 900, blk int default 900, esc boolean default false) returns jsonb
  language sql immutable as $$ select jsonb_build_object('key', k, 'scope', scope, 'max', mx, 'window', win, 'block', blk, 'escalate', esc) $$;

-- ================================================================ acesso: só o servidor
select pg_temp.as_user();
select throws_ok(format($$ select auth_limit_consume(jsonb_build_array(pg_temp.item(%L, 'signin_pair', 5))) $$, pg_temp.k('a')), '42501', null, 'navegador/Data API não consome contagem');
select throws_ok(format($$ select auth_guard_begin(%L, false) $$, pg_temp.k('a')), '42501', null, 'nem consulta a proteção da conta');
select throws_ok(format($$ select auth_device_check(%L, %L) $$, pg_temp.k('a'), pg_temp.k('t')), '42501', null, 'nem confere aparelhos');
select throws_ok(format($$ select auth_send_cooldown(%L) $$, pg_temp.k('a')), '42501', null, 'nem a espera de envio');
select throws_ok($$ select count(*) from auth_devices $$, '42501', null, 'nem lê aparelhos');
select throws_ok($$ select count(*) from auth_account_guard $$, '42501', null, 'nem lê a proteção das contas');
select throws_ok($$ select count(*) from auth_send_cooldown $$, '42501', null, 'nem lê as esperas');
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(format($$ select auth_guard_begin(%L, false) $$, pg_temp.k('a')), 'P0001', 'not allowed', 'sem papel de serviço, a função recusa');

select pg_temp.as_service();
-- ================================================================ 1. contagem atômica (consume)
select throws_ok($$ select auth_limit_consume('[]'::jsonb) $$, 'P0001', 'invalid limit', 'lista vazia recusada');
select throws_ok(format($$ select auth_limit_consume(jsonb_build_array(pg_temp.item(%1$L, 'x', 5), pg_temp.item(%1$L, 'x', 5))) $$, pg_temp.k('dup')), 'P0001', 'invalid limit', 'chave repetida recusada');
select throws_ok(format($$ select auth_limit_consume(jsonb_build_array(pg_temp.item(%L, 'x', 0))) $$, pg_temp.k('z')), 'P0001', 'invalid limit', 'máximo inválido recusado');
select throws_ok($$ select auth_limit_consume(jsonb_build_array(pg_temp.item('fulano@email.com', 'x', 5))) $$, '23514', null, 'e-mail em texto não é aceito como chave');

select is((auth_limit_consume(jsonb_build_array(pg_temp.item(pg_temp.k('c1'), 'signin_pair', 3))) ->> 'blocked')::boolean, false, '1ª tentativa passa');
select is((auth_limit_consume(jsonb_build_array(pg_temp.item(pg_temp.k('c1'), 'signin_pair', 3))) ->> 'blocked')::boolean, false, '2ª passa');
select is((auth_limit_consume(jsonb_build_array(pg_temp.item(pg_temp.k('c1'), 'signin_pair', 3))) ->> 'blocked')::boolean, false, '3ª passa (limite 3)');
select is((auth_limit_consume(jsonb_build_array(pg_temp.item(pg_temp.k('c1'), 'signin_pair', 3))) ->> 'blocked')::boolean, true, '4ª é recusada e bloqueia');
select ok((auth_limit_consume(jsonb_build_array(pg_temp.item(pg_temp.k('c1'), 'signin_pair', 3))) ->> 'retry_after')::int between 890 and 900, 'enquanto bloqueado, informa a espera');
select is((select hits from auth_attempts where key = pg_temp.k('c1')), 0, 'pedido recusado não soma tentativa');

-- devolução: quem acerta devolve a própria tentativa (só falhas ficam contadas)
select auth_limit_consume(jsonb_build_array(pg_temp.item(pg_temp.k('r1'), 'signin_ip', 3)));
select auth_limit_consume(jsonb_build_array(pg_temp.item(pg_temp.k('r1'), 'signin_ip', 3)));
select auth_limit_refund(array[pg_temp.k('r1')]);
select is((select hits from auth_attempts where key = pg_temp.k('r1')), 1, 'acerto devolve 1');
select auth_limit_refund(array[pg_temp.k('r1'), pg_temp.k('r1')]);
select auth_limit_refund(array[pg_temp.k('r1')]);
select is((select hits from auth_attempts where key = pg_temp.k('r1')), 0, 'devolução nunca fica negativa');

-- tudo ou nada: se uma regra estoura, nenhuma conta sobe
select auth_limit_consume(jsonb_build_array(pg_temp.item(pg_temp.k('t-ip'), 'signin_ip', 1)));
select is((auth_limit_consume(jsonb_build_array(pg_temp.item(pg_temp.k('t-ip'), 'signin_ip', 1), pg_temp.item(pg_temp.k('t-pair'), 'signin_pair', 5))) ->> 'scope'), 'signin_ip', 'recusa informa a regra que estourou');
select is((select hits from auth_attempts where key = pg_temp.k('t-pair')), 0, 'a outra regra não contou');

-- janela vencida recomeça; escalonamento como em 0013
select auth_limit_consume(jsonb_build_array(pg_temp.item(pg_temp.k('w1'), 'signin_ip', 2)));
select auth_limit_consume(jsonb_build_array(pg_temp.item(pg_temp.k('w1'), 'signin_ip', 2)));
update auth_attempts set window_start = now() - interval '16 minutes' where key = pg_temp.k('w1');
select is((auth_limit_consume(jsonb_build_array(pg_temp.item(pg_temp.k('w1'), 'signin_ip', 2))) ->> 'blocked')::boolean, false, 'depois da janela, recomeça');
select is((select hits from auth_attempts where key = pg_temp.k('w1')), 1, 'contagem nova');
update auth_attempts set blocked_until = now() - interval '1 second', strikes = 1, hits = 2, window_start = now() where key = pg_temp.k('w1');
select ok((auth_limit_consume(jsonb_build_array(pg_temp.item(pg_temp.k('w1'), 'signin_ip', 2, 900, 900, true))) ->> 'retry_after')::int between 1790 and 1800, 'reincidência com escalonamento dobra a espera');

-- ================================================================ 2. proteção por conta
select is(auth_guard_begin(pg_temp.k('conta1'), false), 'password', '1ª tentativa: confere a senha');
select is(auth_guard_begin(pg_temp.k('conta1'), false), 'password', '2ª');
select is(auth_guard_begin(pg_temp.k('conta1'), false), 'password', '3ª');
select is(auth_guard_begin(pg_temp.k('conta1'), false), 'password', '4ª');
select is(auth_guard_begin(pg_temp.k('conta1'), false), 'password', '5ª');
select is(auth_guard_begin(pg_temp.k('conta1'), false), 'code', '6ª em aparelho desconhecido: só com código');
select is(auth_guard_begin(pg_temp.k('conta1'), false), 'code', 'trocar de aparelho desconhecido não muda nada (a conta é a mesma)');
select is((select attempts from auth_account_guard where account_key = pg_temp.k('conta1')), 5, 'no modo código, nenhuma senha é conferida nem contada');
select ok((select challenged_at from auth_account_guard where account_key = pg_temp.k('conta1')) is not null, 'momento do desafio registrado');
-- aparelho reconhecido: mais folga, mas não dispensa
select is(auth_guard_begin(pg_temp.k('conta1'), true), 'password', 'aparelho reconhecido ainda confere a senha (6ª)');
select auth_guard_begin(pg_temp.k('conta1'), true) from generate_series(1, 4);
select is(auth_guard_begin(pg_temp.k('conta1'), true), 'code', 'aparelho reconhecido também é desafiado ao chegar a 10');
-- sucesso zera; inatividade de 24 h zera
select auth_guard_success(pg_temp.k('conta1'));
select is(auth_guard_begin(pg_temp.k('conta1'), false), 'password', 'depois de um login completo, volta ao normal');
select auth_guard_begin(pg_temp.k('conta2'), false) from generate_series(1, 5);
select is(auth_guard_begin(pg_temp.k('conta2'), false), 'code', 'conta 2 desafiada');
update auth_account_guard set last_attempt_at = now() - interval '25 hours' where account_key = pg_temp.k('conta2');
select is(auth_guard_begin(pg_temp.k('conta2'), false), 'password', 'sem atividade por 24 h, recomeça');
select is(auth_guard_begin(pg_temp.k('conta3'), false), 'password', 'outra conta não é afetada');

-- ================================================================ 3. aparelhos reconhecidos
select is(auth_device_check(pg_temp.k('conta1'), pg_temp.k('tok1')), false, 'token desconhecido não vale');
select auth_device_register(pg_temp.k('conta1'), pg_temp.k('tok1'), 90);
select is(auth_device_check(pg_temp.k('conta1'), pg_temp.k('tok1')), true, 'token registrado vale');
select is(auth_device_check(pg_temp.k('conta2'), pg_temp.k('tok1')), false, 'o mesmo token não vale para outra conta');
select throws_ok(format($$ select auth_device_register(%L, %L, 365) $$, pg_temp.k('conta1'), pg_temp.k('tok2')), 'P0001', 'invalid limit', 'validade acima de 90 dias recusada');
select throws_ok(format($$ select auth_device_register(%L, 'token-em-texto', 90) $$, pg_temp.k('conta1')), '23514', null, 'só o hash do token é aceito');
update auth_devices set expires_at = now() - interval '1 second' where token_hash = pg_temp.k('tok1');
select is(auth_device_check(pg_temp.k('conta1'), pg_temp.k('tok1')), false, 'token vencido não vale');
select auth_device_register(pg_temp.k('conta1'), pg_temp.k('tok1'), 90);
select is(auth_device_check(pg_temp.k('conta1'), pg_temp.k('tok1')), true, 'novo login renova a validade');
select auth_device_register(pg_temp.k('conta1'), pg_temp.k('tok-' || i), 90) from generate_series(1, 12) i;
select is((select count(*)::int from auth_devices where account_key = pg_temp.k('conta1')), 10, 'no máximo 10 aparelhos por conta');
select auth_device_revoke_all(pg_temp.k('conta1'));
select is((select count(*)::int from auth_devices where account_key = pg_temp.k('conta1')), 0, 'revogar apaga todos os aparelhos da conta');

-- ================================================================ 4. espera entre envios
select is((auth_send_cooldown(pg_temp.k('mail1')) ->> 'allowed')::boolean, true, '1º envio imediato');
select is((auth_send_cooldown(pg_temp.k('mail1')) ->> 'allowed')::boolean, false, '2º logo em seguida espera');
select ok((auth_send_cooldown(pg_temp.k('mail1')) ->> 'retry_after')::int between 28 and 30, 'espera de 30 s');
update auth_send_cooldown set next_allowed_at = now() - interval '1 second' where key = pg_temp.k('mail1');
select auth_send_cooldown(pg_temp.k('mail1'));
select ok((auth_send_cooldown(pg_temp.k('mail1')) ->> 'retry_after')::int between 58 and 60, '2º envio: próxima espera 1 min');
update auth_send_cooldown set next_allowed_at = now() - interval '1 second', sends = 7 where key = pg_temp.k('mail1');
select auth_send_cooldown(pg_temp.k('mail1'));
select ok((auth_send_cooldown(pg_temp.k('mail1')) ->> 'retry_after')::int between 590 and 600, 'a espera para em 10 min (sem bloqueio maior)');
update auth_send_cooldown set next_allowed_at = now() - interval '1 second', last_sent_at = now() - interval '2 hours' where key = pg_temp.k('mail1');
select auth_send_cooldown(pg_temp.k('mail1'));
select ok((auth_send_cooldown(pg_temp.k('mail1')) ->> 'retry_after')::int between 28 and 30, 'depois de 1 h sem envios, recomeça em 30 s');
select is((auth_send_cooldown(pg_temp.k('mail2')) ->> 'allowed')::boolean, true, 'outro e-mail não espera');

-- ================================================================ nada em texto
select is((select count(*)::int from auth_devices where token_hash !~ '^[0-9a-f]{64}$' or account_key !~ '^[0-9a-f]{64}$'), 0, 'aparelhos só com hash');

select * from finish();
rollback;
