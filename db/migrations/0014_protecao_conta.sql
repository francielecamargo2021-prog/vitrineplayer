-- =============================================================================
-- VITRINEPLAYER — Proteção de login por conta, contagem atômica e aparelhos reconhecidos (E2).
--
--  1. auth_limit_consume: conta a tentativa e decide numa única operação. Trava as linhas
--     em ordem de chave (sem impasse entre pedidos simultâneos) e é tudo ou nada: se uma
--     regra estoura, nenhuma conta sobe. auth_limit_refund devolve a contagem de quem acertou
--     (o efeito final é contar só as falhas, como em 0013, mas sem corrida).
--     As regras de 0013 continuam valendo: só a forma de contar muda.
--  2. auth_account_guard: proteção por CONTA (de qualquer IP ou aparelho). Depois de 5
--     tentativas de senha sem sucesso (10 num aparelho reconhecido), a senha deixa de ser
--     conferida e o login passa a exigir um código enviado ao e-mail. Não há bloqueio:
--     a dona da conta sempre entra pelo código. Um login completo zera a conta.
--  3. auth_devices: aparelho reconhecido = token aleatório no cookie; o banco guarda só o
--     hash. Vale 90 dias, até 10 por conta, revogável (troca de senha, exclusão de conta).
--  4. auth_send_cooldown: espera progressiva entre envios de código para o MESMO e-mail
--     (imediato, 30 s, 1 min, 2 min, 5 min, 10 min). É por endereço, nunca por rede.
--
--  Chaves (conta, e-mail, IP) são HMAC calculados no servidor: o banco nunca guarda e-mail
--  nem IP em texto. Só o servidor (papel de serviço) chama estas funções.
--  Reversão: db/reversoes/0014_protecao_conta.sql.
-- =============================================================================

-- ---------------------------------------------------------------- 1. contagem atômica
create or replace function auth_limit_consume(p_items jsonb) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  it record;
  a auth_attempts;
  v_hits int;
  v_deny boolean := false;
  v_wait int := 0;
  v_scope text;
  v_exceed text[] := '{}';
begin
  perform mfa_require_service();
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 8 then
    raise exception 'invalid limit';
  end if;
  if (select count(distinct x->>'key') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'invalid limit';
  end if;

  -- 1ª passada: garante e trava as linhas (ordem fixa) e decide sem alterar nada
  for it in
    select * from jsonb_to_recordset(p_items) as x(key text, scope text, max int, "window" int, block int, escalate boolean)
     order by key
  loop
    if it.max is null or it.max < 1 or it."window" is null or it."window" < 1 or it.block is null or it.block < 1 then
      raise exception 'invalid limit';
    end if;
    insert into auth_attempts (key, scope, hits, window_start, updated_at)
    values (it.key, it.scope, 0, now(), now())
    on conflict (key) do nothing;
    select * into a from auth_attempts where key = it.key for update;

    if a.blocked_until > now() then
      v_deny := true;
      if ceil(extract(epoch from (a.blocked_until - now())))::int > v_wait then
        v_wait := ceil(extract(epoch from (a.blocked_until - now())))::int; v_scope := a.scope;
      end if;
    else
      v_hits := case when a.window_start < now() - make_interval(secs => it."window") then 0 else a.hits end;
      if v_hits + 1 > it.max then
        v_deny := true;
        v_exceed := v_exceed || it.key;
      end if;
    end if;
  end loop;

  -- 2ª passada: aplica (tudo ou nada)
  for it in
    select * from jsonb_to_recordset(p_items) as x(key text, scope text, max int, "window" int, block int, escalate boolean)
     order by key
  loop
    select * into a from auth_attempts where key = it.key;
    if v_deny then
      if it.key = any (v_exceed) then
        update auth_attempts
           set blocked_until = now() + make_interval(secs => it.block * case when coalesce(it.escalate, false) then power(2, least(strikes, 3))::int else 1 end),
               strikes = least(strikes + 1, 100), hits = 0, window_start = now(), updated_at = now()
         where key = it.key
         returning * into a;
        if ceil(extract(epoch from (a.blocked_until - now())))::int > v_wait then
          v_wait := ceil(extract(epoch from (a.blocked_until - now())))::int; v_scope := a.scope;
        end if;
      end if;
    else
      update auth_attempts
         set hits = case when window_start < now() - make_interval(secs => it."window") then 1 else hits + 1 end,
             window_start = case when window_start < now() - make_interval(secs => it."window") then now() else window_start end,
             updated_at = now()
       where key = it.key;
    end if;
  end loop;

  delete from auth_attempts
   where key in (select key from auth_attempts
                  where updated_at < now() - interval '1 day' and (blocked_until is null or blocked_until < now())
                  limit 50);

  if v_deny then
    return jsonb_build_object('blocked', true, 'scope', v_scope, 'retry_after', greatest(v_wait, 1));
  end if;
  return jsonb_build_object('blocked', false);
end $$;

-- Quem acertou devolve a própria tentativa (efeito: só as falhas ficam contadas).
create or replace function auth_limit_refund(p_keys text[]) returns void
  language plpgsql security definer set search_path = public as $$
begin
  perform mfa_require_service();
  update auth_attempts set hits = greatest(hits - 1, 0), updated_at = now()
   where key = any (p_keys) and (blocked_until is null or blocked_until <= now());
end $$;

-- ---------------------------------------------------------------- 2. proteção por conta
create table auth_account_guard (
  account_key     text primary key check (account_key ~ '^[0-9a-f]{64}$'),
  attempts        integer not null default 0,
  last_attempt_at timestamptz not null default now(),
  challenged_at   timestamptz
);
create index auth_account_guard_last on auth_account_guard (last_attempt_at);
alter table auth_account_guard enable row level security;
revoke all on auth_account_guard from public, anonymous, authenticated;

-- Antes de conferir uma senha: 'password' (pode conferir; a tentativa já fica contada)
-- ou 'code' (não confere a senha; exige código por e-mail). Sem atividade por 24 h, recomeça.
create or replace function auth_guard_begin(p_account text, p_trusted boolean) returns text
  language plpgsql security definer set search_path = public as $$
declare g auth_account_guard; v_limit int := case when p_trusted then 10 else 5 end;
begin
  perform mfa_require_service();
  insert into auth_account_guard (account_key) values (p_account) on conflict (account_key) do nothing;
  select * into g from auth_account_guard where account_key = p_account for update;
  if g.last_attempt_at < now() - interval '24 hours' then
    update auth_account_guard set attempts = 0, challenged_at = null where account_key = p_account returning * into g;
  end if;
  if g.attempts >= v_limit then
    update auth_account_guard set challenged_at = coalesce(challenged_at, now()) where account_key = p_account;
    return 'code';
  end if;
  update auth_account_guard set attempts = attempts + 1, last_attempt_at = now() where account_key = p_account;
  delete from auth_account_guard
   where account_key in (select account_key from auth_account_guard where last_attempt_at < now() - interval '2 days' limit 50);
  return 'password';
end $$;

-- Login completo (senha certa ou código certo) ou troca de senha: a conta volta ao normal.
create or replace function auth_guard_success(p_account text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  perform mfa_require_service();
  delete from auth_account_guard where account_key = p_account;
end $$;

-- ---------------------------------------------------------------- 3. aparelhos reconhecidos
create table auth_devices (
  account_key  text not null check (account_key ~ '^[0-9a-f]{64}$'),
  token_hash   text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  primary key (account_key, token_hash)
);
create index auth_devices_expires on auth_devices (expires_at);
alter table auth_devices enable row level security;
revoke all on auth_devices from public, anonymous, authenticated;

create or replace function auth_device_check(p_account text, p_token_hash text) returns boolean
  language plpgsql security definer set search_path = public as $$
declare v_found boolean;
begin
  perform mfa_require_service();
  update auth_devices set last_used_at = now()
   where account_key = p_account and token_hash = p_token_hash and expires_at > now()
  returning true into v_found;
  return coalesce(v_found, false);
end $$;

-- Registra (ou renova) o aparelho depois de um login completo. Mantém só os 10 mais recentes.
create or replace function auth_device_register(p_account text, p_token_hash text, p_days int) returns void
  language plpgsql security definer set search_path = public as $$
begin
  perform mfa_require_service();
  if p_days not between 1 and 90 then raise exception 'invalid limit'; end if;
  insert into auth_devices (account_key, token_hash, expires_at)
  values (p_account, p_token_hash, now() + make_interval(days => p_days))
  on conflict (account_key, token_hash) do update set last_used_at = now(), expires_at = excluded.expires_at;
  delete from auth_devices
   where account_key = p_account
     and token_hash not in (select token_hash from auth_devices where account_key = p_account
                             order by last_used_at desc limit 10);
  delete from auth_devices where ctid in (select ctid from auth_devices where expires_at < now() limit 100);
end $$;

create or replace function auth_device_revoke_all(p_account text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  perform mfa_require_service();
  delete from auth_devices where account_key = p_account;
end $$;

-- ---------------------------------------------------------------- 4. espera entre envios de código
create table auth_send_cooldown (
  key             text primary key check (key ~ '^[0-9a-f]{64}$'),
  sends           integer not null default 0,
  last_sent_at    timestamptz,
  next_allowed_at timestamptz
);
alter table auth_send_cooldown enable row level security;
revoke all on auth_send_cooldown from public, anonymous, authenticated;

create or replace function auth_send_cooldown(p_key text) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare c auth_send_cooldown; v_steps int[] := array[30, 60, 120, 300, 600];
begin
  perform mfa_require_service();
  insert into auth_send_cooldown (key) values (p_key) on conflict (key) do nothing;
  select * into c from auth_send_cooldown where key = p_key for update;
  if c.next_allowed_at > now() then
    return jsonb_build_object('allowed', false, 'retry_after', greatest(ceil(extract(epoch from (c.next_allowed_at - now())))::int, 1));
  end if;
  if c.last_sent_at is null or c.last_sent_at < now() - interval '1 hour' then c.sends := 0; end if;
  update auth_send_cooldown
     set sends = c.sends + 1, last_sent_at = now(),
         next_allowed_at = now() + make_interval(secs => v_steps[least(c.sends + 1, 5)])
   where key = p_key;
  delete from auth_send_cooldown
   where key in (select key from auth_send_cooldown where last_sent_at < now() - interval '1 day' limit 50);
  return jsonb_build_object('allowed', true);
end $$;

-- ---------------------------------------------------------------- permissões: só o servidor
revoke execute on function
  auth_limit_consume(jsonb), auth_limit_refund(text[]),
  auth_guard_begin(text, boolean), auth_guard_success(text),
  auth_device_check(text, text), auth_device_register(text, text, int), auth_device_revoke_all(text),
  auth_send_cooldown(text)
  from public, anonymous, authenticated;
