-- =============================================================================
-- VITRINEPLAYER — Limite de tentativas de login, códigos e cadastro.
--
--  * Os contadores ficam no banco: valem para todas as instâncias serverless ao mesmo
--    tempo (não há memória local que um atacante possa "espalhar" entre instâncias).
--  * Cada chave é um HMAC calculado no servidor (escopo + e-mail/IP). O banco nunca
--    guarda e-mail nem IP em texto (minimização, LGPD art. 6º, III).
--  * Incremento atômico (insert ... on conflict ... do update): duas requisições
--    simultâneas não "perdem" tentativas.
--  * Somente o servidor (papel de serviço) chama estas funções; o navegador e a
--    Data API não leem nem alteram nada.
--  * Linhas paradas há mais de 1 dia (e sem bloqueio vigente) são apagadas aos poucos.
-- =============================================================================

create table auth_attempts (
  key           text primary key check (key ~ '^[0-9a-f]{64}$'),
  scope         text not null check (scope ~ '^[a-z_]{2,40}$'),
  hits          integer not null default 0,
  window_start  timestamptz not null default now(),
  blocked_until timestamptz,
  strikes       smallint not null default 0,
  updated_at    timestamptz not null default now()
);
create index auth_attempts_updated on auth_attempts (updated_at);
alter table auth_attempts enable row level security;   -- sem políticas: ninguém lê pela API
revoke all on auth_attempts from public, anonymous, authenticated;

-- Bloqueio vigente entre as chaves informadas: o maior tempo de espera (segundos) e o escopo.
create or replace function auth_limit_check(p_keys text[]) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare r record;
begin
  perform mfa_require_service();
  select a.scope, ceil(extract(epoch from (a.blocked_until - now())))::int as wait
    into r
    from auth_attempts a
   where a.key = any (p_keys) and a.blocked_until > now()
   order by a.blocked_until desc
   limit 1;
  if r.scope is null then return jsonb_build_object('blocked', false); end if;
  return jsonb_build_object('blocked', true, 'scope', r.scope, 'retry_after', greatest(r.wait, 1));
end $$;

-- Registra uma tentativa. Ao atingir p_max dentro da janela (p_window s), bloqueia por
-- p_block s; com p_escalate, cada novo bloqueio dobra o tempo (até 8×).
create or replace function auth_limit_hit(p_key text, p_scope text, p_max int, p_window int, p_block int, p_escalate boolean default false)
  returns jsonb
  language plpgsql security definer set search_path = public as $$
declare a auth_attempts;
begin
  perform mfa_require_service();
  if p_max < 1 or p_window < 1 or p_block < 1 then raise exception 'invalid limit'; end if;

  insert into auth_attempts as t (key, scope, hits, window_start, updated_at)
  values (p_key, p_scope, 1, now(), now())
  on conflict (key) do update set
    hits         = case when t.window_start < now() - make_interval(secs => p_window) then 1 else t.hits + 1 end,
    window_start = case when t.window_start < now() - make_interval(secs => p_window) then now() else t.window_start end,
    updated_at   = now()
  returning * into a;

  if a.hits >= p_max and (a.blocked_until is null or a.blocked_until <= now()) then
    update auth_attempts
       set blocked_until = now() + make_interval(secs => p_block * case when p_escalate then power(2, least(strikes, 3))::int else 1 end),
           strikes = least(strikes + 1, 100), hits = 0, window_start = now()
     where key = p_key
     returning * into a;
  end if;

  -- limpeza aos poucos (no máximo 50 linhas por chamada)
  delete from auth_attempts
   where key in (select key from auth_attempts
                  where updated_at < now() - interval '1 day' and (blocked_until is null or blocked_until < now())
                  limit 50);

  return jsonb_build_object('hits', a.hits, 'blocked', a.blocked_until is not null and a.blocked_until > now(),
                            'retry_after', case when a.blocked_until > now() then greatest(ceil(extract(epoch from (a.blocked_until - now())))::int, 1) end);
end $$;

-- Sucesso: zera as chaves informadas (ex.: e-mail + IP depois de entrar com a senha certa).
create or replace function auth_limit_clear(p_keys text[]) returns void
  language plpgsql security definer set search_path = public as $$
begin
  perform mfa_require_service();
  delete from auth_attempts where key = any (p_keys);
end $$;

revoke execute on function auth_limit_check(text[]), auth_limit_hit(text, text, int, int, int, boolean), auth_limit_clear(text[])
  from public, anonymous, authenticated;
