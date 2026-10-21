-- =============================================================================
-- VITRINEPLAYER — Segundo fator para administradores (TOTP), fase C4.
-- Plano: PLANO-MIGRACAO §3 e PLANO-FUNCIONALIDADES.
--
--  * is_admin() passa a exigir, além do papel ADMIN, a PROVA do segundo fator na
--    requisição: a claim "vp_mfa" (definida só pelo servidor, a partir de um cookie
--    HttpOnly) precisa corresponder a uma sessão de segundo fator válida no banco.
--    Uma senha de admin vazada, sozinha, não lê nem decide nada — nem pela Data API,
--    cujo JWT não tem essa claim.
--  * O segredo TOTP fica CIFRADO (AES-256-GCM) com uma chave que existe só no servidor;
--    o banco guarda o texto cifrado, os códigos de recuperação em hash, as tentativas
--    e o último passo usado (contra reaproveitamento do mesmo código).
--  * Operações do segundo fator: só o servidor (papel de serviço), nunca o navegador.
--  * 5 erros seguidos → espera de 15 minutos. Sessão de segundo fator: 8 horas.
-- =============================================================================

create table admin_mfa (
  profile_id      uuid primary key references profiles (id) on delete cascade,
  secret_enc      text not null,
  enabled_at      timestamptz,
  recovery_hashes text[] not null default '{}',
  failed_attempts smallint not null default 0,
  locked_until    timestamptz,
  last_step       bigint,
  updated_at      timestamptz not null default now()
);
create table admin_mfa_sessions (
  token_hash  text primary key,
  profile_id  uuid not null references profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index admin_mfa_sessions_profile on admin_mfa_sessions (profile_id, expires_at);
alter table admin_mfa enable row level security;            -- sem políticas: ninguém lê pela API
alter table admin_mfa_sessions enable row level security;
revoke all on admin_mfa, admin_mfa_sessions from anonymous, authenticated;

-- Prova do segundo fator na requisição atual.
create or replace function mfa_verified() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admin_mfa_sessions s
     where s.profile_id = public.vp_uid() and s.expires_at > now()
       and s.token_hash = encode(sha256(convert_to(coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'vp_mfa', ''), 'UTF8')), 'hex'))
$$;

create or replace function is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() = 'ADMIN', false) and mfa_verified()
$$;

-- ---------------------------------------------------------------- operações (somente servidor)
create or replace function mfa_require_service() returns void
  language plpgsql stable set search_path = public as $$
begin
  if coalesce(public.request_role(), '') <> 'service_role' then raise exception 'not allowed'; end if;
end $$;

create or replace function mfa_state(p_profile uuid) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare m admin_mfa;
begin
  perform mfa_require_service();
  if not exists (select 1 from profiles where id = p_profile and role = 'ADMIN') then raise exception 'not admin'; end if;
  select * into m from admin_mfa where profile_id = p_profile;
  return jsonb_build_object('enrolled', m.enabled_at is not null, 'pending', m.profile_id is not null and m.enabled_at is null,
                            'secret_enc', m.secret_enc, 'locked_until', m.locked_until, 'last_step', m.last_step,
                            'recovery_left', coalesce(cardinality(m.recovery_hashes), 0));
end $$;

-- Novo cadastro (ou troca) do segundo fator. Trocar um fator ativo exige estar verificado.
create or replace function mfa_begin_enroll(p_profile uuid, p_secret_enc text, p_verified boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  perform mfa_require_service();
  if not exists (select 1 from profiles where id = p_profile and role = 'ADMIN') then raise exception 'not admin'; end if;
  if exists (select 1 from admin_mfa where profile_id = p_profile and enabled_at is not null) and not p_verified then
    raise exception 'already enrolled';
  end if;
  insert into admin_mfa (profile_id, secret_enc) values (p_profile, p_secret_enc)
  on conflict (profile_id) do update set secret_enc = excluded.secret_enc, enabled_at = null, recovery_hashes = '{}',
    failed_attempts = 0, locked_until = null, last_step = null, updated_at = now();
end $$;

create or replace function mfa_register_failure(p_profile uuid) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare m admin_mfa;
begin
  perform mfa_require_service();
  update admin_mfa set failed_attempts = failed_attempts + 1,
         locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end,
         updated_at = now()
   where profile_id = p_profile returning * into m;
  if m.failed_attempts >= 5 then
    update admin_mfa set failed_attempts = 0 where profile_id = p_profile;
    insert into audit_log (actor_id, action, entity, entity_id) values (p_profile, 'admin.mfa.locked', 'profiles', p_profile);
  end if;
  return jsonb_build_object('locked_until', m.locked_until);
end $$;

-- Código conferido pelo servidor → abre a sessão de segundo fator (8 h). Mesmo passo não vale duas vezes.
create or replace function mfa_open_session(p_profile uuid, p_step bigint, p_token_hash text, p_recovery_hashes text[] default null)
  returns void
  language plpgsql security definer set search_path = public as $$
declare m admin_mfa;
begin
  perform mfa_require_service();
  select * into m from admin_mfa where profile_id = p_profile for update;
  if m.profile_id is null then raise exception 'not enrolled'; end if;
  if m.locked_until is not null and m.locked_until > now() then raise exception 'locked'; end if;
  if m.last_step is not null and p_step <= m.last_step then raise exception 'code reused'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid token'; end if;
  if m.enabled_at is null then
    if p_recovery_hashes is null or cardinality(p_recovery_hashes) <> 10 then raise exception 'recovery codes required'; end if;
    update admin_mfa set enabled_at = now(), recovery_hashes = p_recovery_hashes where profile_id = p_profile;
    insert into audit_log (actor_id, action, entity, entity_id) values (p_profile, 'admin.mfa.enrolled', 'profiles', p_profile);
  end if;
  update admin_mfa set last_step = p_step, failed_attempts = 0, locked_until = null, updated_at = now() where profile_id = p_profile;
  delete from admin_mfa_sessions where profile_id = p_profile and expires_at <= now();
  insert into admin_mfa_sessions (token_hash, profile_id, expires_at) values (p_token_hash, p_profile, now() + interval '8 hours');
  insert into audit_log (actor_id, action, entity, entity_id) values (p_profile, 'admin.mfa.login', 'profiles', p_profile);
end $$;

-- Código de recuperação (uso único) → abre a sessão.
create or replace function mfa_use_recovery(p_profile uuid, p_code_hash text, p_token_hash text) returns int
  language plpgsql security definer set search_path = public as $$
declare m admin_mfa;
begin
  perform mfa_require_service();
  select * into m from admin_mfa where profile_id = p_profile for update;
  if m.enabled_at is null then raise exception 'not enrolled'; end if;
  if m.locked_until is not null and m.locked_until > now() then raise exception 'locked'; end if;
  if not (p_code_hash = any (m.recovery_hashes)) then raise exception 'invalid code'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid token'; end if;
  update admin_mfa set recovery_hashes = array_remove(recovery_hashes, p_code_hash), failed_attempts = 0, locked_until = null, updated_at = now()
   where profile_id = p_profile;
  insert into admin_mfa_sessions (token_hash, profile_id, expires_at) values (p_token_hash, p_profile, now() + interval '8 hours');
  insert into audit_log (actor_id, action, entity, entity_id) values (p_profile, 'admin.mfa.recovery', 'profiles', p_profile);
  return cardinality(m.recovery_hashes) - 1;
end $$;

create or replace function mfa_close_session(p_token_hash text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  perform mfa_require_service();
  delete from admin_mfa_sessions where token_hash = p_token_hash;
end $$;

revoke execute on function mfa_require_service(), mfa_state(uuid), mfa_begin_enroll(uuid, text, boolean), mfa_register_failure(uuid),
  mfa_open_session(uuid, bigint, text, text[]), mfa_use_recovery(uuid, text, text), mfa_close_session(text)
  from public, anonymous, authenticated;
revoke execute on function mfa_verified() from public, anonymous;
grant execute on function mfa_verified() to authenticated;
