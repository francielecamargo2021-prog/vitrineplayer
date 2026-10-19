-- =============================================================================
-- TORNAR UMA CONTA ADMINISTRADORA (somente homologação)
-- 1. Crie a conta normalmente em /pt/cadastro.
-- 2. Troque SEU_EMAIL_AQUI abaixo pelo e-mail dessa conta.
-- 3. Cole no SQL Editor e clique em Run.
-- A interface nunca permite virar admin; este é o único caminho, e fica na auditoria.
-- =============================================================================
do $vp$
declare
  v_email text := lower(trim('SEU_EMAIL_AQUI'));
  v_id uuid;
begin
  if not exists (select 1 from pg_namespace where nspname = 'vp_meta') then
    raise exception 'VITRINEPLAYER: projeto não marcado como homologação. Nada foi alterado.';
  end if;
  if not exists (select 1 from vp_meta.environment where name = 'homolog') then
    raise exception 'VITRINEPLAYER: este projeto não é o de homologação. Nada foi alterado.';
  end if;
  if v_email = 'seu_email_aqui' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'VITRINEPLAYER: troque SEU_EMAIL_AQUI pelo e-mail da conta. Nada foi alterado.';
  end if;
  select id into v_id from profiles where lower(email) = v_email;
  if v_id is null then
    raise exception 'VITRINEPLAYER: nenhuma conta com o e-mail %. Crie a conta em /pt/cadastro primeiro.', v_email;
  end if;
  update profiles set role = 'ADMIN' where id = v_id;
  insert into audit_log (action, entity, entity_id, meta)
  values ('profile.promote_admin', 'profiles', v_id, jsonb_build_object('via', 'sql_editor_homolog'));
end $vp$;

select full_name, email, role from profiles where role = 'ADMIN';
