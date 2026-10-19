-- =============================================================================
-- PASSO 05 — migration 0005_admin_review
-- Gerado por scripts/homolog/gerar-passos.sh a partir de supabase/migrations/0005_admin_review.sql.
-- NÃO EDITAR À MÃO. Colar inteiro no SQL Editor do projeto vitrineplayer-homolog e clicar em Run.
-- É uma única transação: se qualquer linha falhar, nada é gravado.
-- =============================================================================
do $vp$
begin
  if not exists (select 1 from pg_namespace where nspname = 'vp_meta') then
    raise exception 'VITRINEPLAYER: projeto não marcado como homologação (rode o passo 00). Nada foi alterado.';
  end if;
  if not exists (select 1 from vp_meta.environment where name = 'homolog') then
    raise exception 'VITRINEPLAYER: este projeto não é o de homologação. Nada foi alterado.';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '0005') then
    raise exception 'VITRINEPLAYER: migration 0005_admin_review já aplicada. Nada foi alterado.';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '0004') then
    raise exception 'VITRINEPLAYER: aplique antes a migration 0004. Nada foi alterado.';
  end if;
end $vp$;

-- ---------------------------------------------------------------- início da migration original
-- =============================================================================
-- VITRINEPLAYER — revisão pelo administrador (atletas e organizações)
-- Somente acréscimos: não altera tabelas, políticas ou funções de 0001–0004.
--
--  * Únicos caminhos de decisão: admin_review_athlete e admin_review_organization.
--    Cada decisão grava autor, data, motivo e audit_log, e avisa o responsável
--    (atleta) pela fila notification_outbox.
--  * Só administradores humanos (ADMIN): service role não decide revisões.
--  * Transições permitidas (atleta):  in_review → approved | rejected
--                                     approved  → suspended
--                                     suspended → approved
--    Rejeitar e suspender exigem motivo (mostrado ao responsável).
--  * Transições permitidas (organização): pending → approved | rejected
--                                         approved → suspended
--                                         suspended | rejected → approved
--  * Fotos: o admin lê as fotos do atleta em revisão (URL assinada).
-- =============================================================================

create or replace function admin_review_athlete(p_athlete uuid, p_decision text, p_note text default null)
  returns athlete_status
  language plpgsql security definer set search_path = public as $$
declare
  v_old athlete_status;
  v_new athlete_status;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_guardian uuid;
begin
  if auth.uid() is null or not is_admin() then raise exception 'not allowed'; end if;
  select status into v_old from athletes where id = p_athlete for update;
  if v_old is null then raise exception 'athlete not found'; end if;

  v_new := case
    when p_decision = 'approve'   and v_old = 'in_review' then 'approved'
    when p_decision = 'reject'    and v_old = 'in_review' then 'rejected'
    when p_decision = 'suspend'   and v_old = 'approved'  then 'suspended'
    when p_decision = 'reinstate' and v_old = 'suspended' then 'approved'
  end::athlete_status;
  if v_new is null then raise exception 'invalid transition'; end if;
  if p_decision in ('reject', 'suspend') and (v_note is null or length(v_note) < 5) then
    raise exception 'note required';
  end if;
  if length(v_note) > 1000 then raise exception 'note too long'; end if;

  update athletes set
    status      = v_new,
    reviewed_by = auth.uid(),
    review_note = v_note,
    approved_at = case when v_new = 'approved' then coalesce(approved_at, now()) else approved_at end
  where id = p_athlete;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'athlete.review.' || p_decision, 'athletes', p_athlete,
          jsonb_build_object('from', v_old, 'to', v_new, 'note', v_note));

  select profile_id into v_guardian from athlete_guardians where athlete_id = p_athlete and is_primary;
  if v_guardian is not null then
    insert into notification_outbox (profile_id, channel, template, payload)
    values (v_guardian, 'email',
            case v_new when 'approved' then 'profile_approved' when 'rejected' then 'profile_rejected' else 'profile_suspended' end,
            jsonb_build_object('athlete_id', p_athlete, 'note', v_note));
  end if;
  return v_new;
end $$;

create or replace function admin_review_organization(p_org uuid, p_decision text, p_note text default null)
  returns review_status
  language plpgsql security definer set search_path = public as $$
declare
  v_old review_status;
  v_new review_status;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null or not is_admin() then raise exception 'not allowed'; end if;
  select status into v_old from organizations where id = p_org for update;
  if v_old is null then raise exception 'organization not found'; end if;

  v_new := case
    when p_decision = 'approve'   and v_old in ('pending', 'rejected', 'suspended') then 'approved'
    when p_decision = 'reject'    and v_old = 'pending'  then 'rejected'
    when p_decision = 'suspend'   and v_old = 'approved' then 'suspended'
  end::review_status;
  if v_new is null then raise exception 'invalid transition'; end if;
  if p_decision in ('reject', 'suspend') and (v_note is null or length(v_note) < 5) then
    raise exception 'note required';
  end if;
  if length(v_note) > 1000 then raise exception 'note too long'; end if;

  update organizations set status = v_new, reviewed_by = auth.uid(), reviewed_at = now() where id = p_org;

  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'organization.review.' || p_decision, 'organizations', p_org,
          jsonb_build_object('from', v_old, 'to', v_new, 'note', v_note));
  return v_new;
end $$;

revoke execute on function admin_review_athlete(uuid, text, text) from public, anon;
revoke execute on function admin_review_organization(uuid, text, text) from public, anon;
grant execute on function admin_review_athlete(uuid, text, text) to authenticated;
grant execute on function admin_review_organization(uuid, text, text) to authenticated;

-- Fotos do atleta para a revisão (somente leitura).
create policy photos_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'athlete-photos' and is_admin());

-- ---------------------------------------------------------------- fim da migration original
insert into supabase_migrations.schema_migrations (version, name) values ('0005', 'admin_review');
select 'OK: migration 0005_admin_review aplicada' as resultado;
