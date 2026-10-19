-- =============================================================================
-- Camada de compatibilidade Neon — aplicada DEPOIS das migrations 0001–0005.
-- No Neon o cadastro (Managed Better Auth) grava só nome e e-mail em
-- neon_auth."user". O gatilho cria o perfil; WhatsApp, país, idioma e
-- consentimentos chegam logo depois por complete_signup(), chamada pela Server
-- Action de cadastro com a sessão do próprio usuário.
-- =============================================================================

create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, role, full_name, email, country, locale)
  values (new.id, 'RESPONSIBLE', coalesce(new.name, ''), new.email, null, 'pt-BR')
  on conflict (id) do nothing;
  return new;
end $$;

-- Completa o cadastro: só o próprio usuário, só uma vez, só consentimentos conhecidos.
create or replace function complete_signup(
  p_whatsapp text, p_country text, p_locale text, p_consents text[],
  p_consent_version text, p_ip text default null, p_ua text default null
) returns void
  language plpgsql security definer set search_path = public as $$
declare v_kind text; v_country text := upper(coalesce(p_country, ''));
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if exists (select 1 from consents where profile_id = auth.uid() and athlete_id is null) then
    raise exception 'signup already completed';
  end if;
  update profiles set
    whatsapp = nullif(p_whatsapp, ''), phone = nullif(p_whatsapp, ''),
    country  = case when v_country ~ '^[A-Z]{2}$' then v_country end,
    locale   = case when p_locale in ('pt-BR', 'es') then p_locale else 'pt-BR' end
  where id = auth.uid();
  foreach v_kind in array coalesce(p_consents, '{}') loop
    if v_kind in ('terms', 'privacy', 'guardian_declaration', 'no_guarantee') then
      insert into consents (profile_id, kind, version, ip, user_agent)
      values (auth.uid(), v_kind::consent_kind, coalesce(p_consent_version, 'unversioned'),
              case when p_ip ~ '^[0-9A-Fa-f:.]{3,45}$' then p_ip::inet end, left(p_ua, 300));
    end if;
  end loop;
end $$;
revoke execute on function complete_signup(text, text, text, text[], text, text, text) from public, anonymous;
grant execute on function complete_signup(text, text, text, text[], text, text, text) to authenticated;
