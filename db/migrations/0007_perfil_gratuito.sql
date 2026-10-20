-- =============================================================================
-- Perfil gratuito do atleta (nova direção de produto, 20/10/2026).
-- Só acrescenta regras; nenhuma proteção existente fica mais fraca.
--  * Cadastro e publicação GRATUITOS: o responsável envia o perfil direto para a
--    revisão do admin (sem pagamento). A aprovação continua exclusiva do admin.
--  * Modalidade: campo ou futsal.
--  * Objetivos novos: escolinha e núcleo de captação.
--  * Até 20 vídeos do YouTube por atleta, garantido no banco (as 12 fotos já eram).
--  * "Sou o próprio atleta" (relation = 'self') só para maiores de 18 anos.
--    Menores sempre têm um responsável legal administrando o perfil.
-- =============================================================================

create type sport_modality as enum ('field', 'futsal');
alter table athletes add column modality sport_modality;

alter type seeking_kind add value if not exists 'school';
alter type seeking_kind add value if not exists 'scouting_hub';

-- ---------------------------------------------------------------- maioridade
create or replace function is_adult(p_birth date) returns boolean
  language sql immutable as $$
  select p_birth <= (current_date - interval '18 years')::date
$$;

-- Novo atleta: igual a 0002, mais a regra da maioridade para quem administra o próprio perfil.
create or replace function create_athlete(
  p_full_name text, p_sport_name text, p_birth_date date, p_country char(2),
  p_relation guardian_relation default 'legal_guardian'
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if public.vp_uid() is null or auth_role() <> 'RESPONSIBLE' then raise exception 'not allowed'; end if;
  if length(trim(p_full_name)) < 3 then raise exception 'invalid name'; end if;
  if p_birth_date > current_date or p_birth_date < date '1990-01-01' then raise exception 'invalid birth date'; end if;
  if p_relation = 'self' and not is_adult(p_birth_date) then raise exception 'minor needs guardian'; end if;
  insert into athletes (full_name, sport_name, birth_date, country)
    values (trim(p_full_name), nullif(trim(p_sport_name), ''), p_birth_date, upper(p_country))
    returning id into v_id;
  insert into athlete_guardians (athlete_id, profile_id, relation, is_primary) values (v_id, public.vp_uid(), p_relation, true);
  insert into audit_log (actor_id, action, entity, entity_id) values (public.vp_uid(), 'athlete.create', 'athletes', v_id);
  return v_id;
end $$;

-- Mudar a data de nascimento não pode transformar um "próprio atleta" em menor.
create or replace function guard_self_adult() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.birth_date is distinct from old.birth_date and not is_adult(new.birth_date)
     and exists (select 1 from athlete_guardians where athlete_id = new.id and relation = 'self') then
    raise exception 'minor needs guardian';
  end if;
  return new;
end $$;
create trigger athletes_self_adult before update on athletes
  for each row execute function guard_self_adult();

-- O vínculo "self" também respeita a maioridade quando criado ou alterado (ex.: pelo admin).
create or replace function guard_guardian_self() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.relation = 'self' and not exists (select 1 from athletes where id = new.athlete_id and is_adult(birth_date)) then
    raise exception 'minor needs guardian';
  end if;
  return new;
end $$;
create trigger athlete_guardians_self_adult before insert or update on athlete_guardians
  for each row execute function guard_guardian_self();

-- ---------------------------------------------------------------- publicação gratuita
-- Responsável: rascunho → revisão (grátis), rejeitado → revisão (após ajustes),
-- revisão → rascunho (desistir do envio). "Aguardando pagamento" (legado) só sai do estado.
-- Aprovar, suspender e os campos de revisão continuam exclusivos do admin.
create or replace function guard_athlete_update() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if not is_privileged() then
    if new.reviewed_by is distinct from old.reviewed_by
       or new.review_note is distinct from old.review_note
       or new.approved_at is distinct from old.approved_at then
      raise exception 'campo não editável';
    end if;
    if new.status <> old.status and not (
         (old.status in ('draft', 'pending_payment', 'rejected') and new.status = 'in_review') or
         (old.status in ('in_review', 'pending_payment') and new.status = 'draft')) then
      raise exception 'mudança de status não permitida';
    end if;
    if new.status = 'in_review' and old.status <> 'in_review'
       and (new.primary_position is null or new.modality is null or new.category is null) then
      raise exception 'perfil incompleto para revisão';
    end if;
    new.submitted_at := case when new.status = 'in_review' and old.status <> 'in_review' then now() else old.submitted_at end;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- vídeos: até 20
create or replace function guard_video_limit() returns trigger
  language plpgsql as $$
begin
  if new.kind = 'youtube' and (select count(*) from athlete_media where athlete_id = new.athlete_id and kind = 'youtube') >= 20 then
    raise exception 'video limit reached';
  end if;
  return new;
end $$;
create trigger athlete_media_video_limit before insert on athlete_media
  for each row execute function guard_video_limit();
