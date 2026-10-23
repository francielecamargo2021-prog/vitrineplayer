-- =============================================================================
-- VITRINEPLAYER — Faixa etária de 6 a 22 anos e acesso por idade (10/2026).
-- PROPOSTA: não aplicada na homologação. Aplicar só com aprovação específica.
--
--  1. Cadastro: atleta novo (ou data de nascimento alterada) precisa ter de 6 a 22 anos.
--     Perfis antigos fora da faixa não são bloqueados para outras edições.
--  2. Idade calculada SEMPRE pela data de hoje (athlete_age): as permissões mudam sozinhas
--     com o aniversário. Aos 23 anos o atleta sai de todo acesso profissional; o responsável
--     ou titular continua vendo e editando (regras do responsável não mudam).
--  3. Faixa de idade por organização, autorizada pelo admin, nunca abaixo do piso do tipo:
--        escolinha, clube ............ piso 6  · padrão sem autorização: 11–22
--        núcleo de captação .......... piso 6  · padrão: NENHUM acesso até o admin definir
--        olheiro ..................... piso 11 · padrão 11–22
--        empresário, agente .......... piso 15 · padrão 15–22
--        marca, empresa .............. piso 18 · padrão 18–22 (sem busca de menores)
--     6 a 10 anos: só escolinha, clube ou núcleo com faixa autorizada pelo admin.
--  4. athlete_visible_to_pro passa a exigir que alguma organização aprovada do usuário cubra
--     a idade atual do atleta. Como busca, ficha, fotos, interesse, notas, avaliações, listas
--     e funil usam essa função, a regra vale para todos de uma vez.
--  5. Escrita sempre pela organização certa: gatilhos conferem que a organização gravada em
--     interesse, nota, avaliação e funil cobre a idade (caso de quem é membro de duas).
--  6. 6 a 10 anos: sem análise por IA com notas e sem avaliação com notas de profissionais.
--  7. Interesse com finalidade: geral, convite para avaliação, bolsa de 50%, bolsa de 100%
--     ou apresentação da escolinha. Bolsas e apresentação só de escolinha; convite para
--     avaliação de escolinha, clube ou núcleo. Tudo continua passando pelo responsável,
--     com as mesmas regras de mensagem, limite e resposta.
--
--  Nada aqui altera as regras do responsável, do admin, da IA (além do bloqueio 6–10) ou do
--  login. Reversão: db/reversoes/0015_faixa_etaria.sql.
-- =============================================================================

-- ---------------------------------------------------------------- 1. idade atual
create or replace function athlete_age(p_birth date) returns int
  language sql stable set search_path = public as $$
  select extract(year from age(current_date, p_birth))::int
$$;

create or replace function athletes_age_range_check() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.birth_date is distinct from old.birth_date then
    if new.birth_date is null or athlete_age(new.birth_date) not between 6 and 22 then
      raise exception 'age out of range';
    end if;
  end if;
  return new;
end $$;
create trigger athletes_age_range before insert or update of birth_date on athletes
  for each row execute function athletes_age_range_check();

-- ---------------------------------------------------------------- 2. faixa por organização
alter table organizations
  add column athlete_age_min smallint,
  add column athlete_age_max smallint,
  add column age_band_by     uuid references profiles (id) on delete set null,
  add column age_band_at     timestamptz,
  add constraint organizations_age_band check (
    (athlete_age_min is null and athlete_age_max is null)
    or (athlete_age_min between 6 and 22 and athlete_age_max between athlete_age_min and 22));

-- piso legal/produto de cada tipo: o admin nunca autoriza abaixo dele
create or replace function org_kind_age_floor(p_kind pro_org_kind) returns int
  language sql immutable as $$
  select case p_kind::text
    when 'school' then 6 when 'club' then 6 when 'scouting_hub' then 6
    when 'scout' then 11
    when 'agent' then 15 when 'manager' then 15
    else 18 end
$$;

-- faixa efetiva [mín, máx]; nulo = sem acesso
create or replace function org_age_min(p_org uuid) returns int
  language sql stable security definer set search_path = public as $$
  select case
    when o.athlete_age_min is not null then greatest(o.athlete_age_min, org_kind_age_floor(o.kind))
    when o.kind = 'scouting_hub' then null                       -- núcleo: só com autorização
    else greatest(11, org_kind_age_floor(o.kind)) end
    from organizations o where o.id = p_org
$$;
create or replace function org_age_max(p_org uuid) returns int
  language sql stable security definer set search_path = public as $$
  select case
    when o.athlete_age_max is not null then least(o.athlete_age_max, 22)
    when o.kind = 'scouting_hub' then null
    else 22 end
    from organizations o where o.id = p_org
$$;

-- a organização cobre a idade ATUAL do atleta?
create or replace function athlete_age_allowed(p_athlete uuid, p_org uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select athlete_age(a.birth_date) between org_age_min(p_org) and org_age_max(p_org)
      from athletes a where a.id = p_athlete), false)
$$;

-- admin define a faixa (nulos = volta ao padrão do tipo); fica na auditoria
create or replace function admin_set_org_age_band(p_org uuid, p_min int, p_max int, p_note text default null) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_kind pro_org_kind;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if public.vp_uid() is null or not is_admin() then raise exception 'not allowed'; end if;
  select kind into v_kind from organizations where id = p_org;
  if v_kind is null then raise exception 'not found'; end if;
  if v_note is null or length(v_note) < 5 then raise exception 'note required'; end if;
  if (p_min is null) <> (p_max is null) then raise exception 'invalid band'; end if;
  if p_min is not null and (p_min < org_kind_age_floor(v_kind) or p_max > 22 or p_min > p_max) then
    raise exception 'invalid band';
  end if;
  update organizations set athlete_age_min = p_min, athlete_age_max = p_max, age_band_by = public.vp_uid(), age_band_at = now()
   where id = p_org;
  insert into audit_log (actor_id, action, entity, entity_id, meta)
  values (public.vp_uid(), 'organization.age_band', 'organizations', p_org,
          jsonb_build_object('min', p_min, 'max', p_max, 'note', v_note));
end $$;

-- faixa da(s) organização(ões) do profissional (para o portal explicar o que ele vê)
create or replace function pro_age_bands() returns table (organization_id uuid, age_min int, age_max int)
  language sql stable security definer set search_path = public as $$
  select o, org_age_min(o), org_age_max(o) from my_approved_orgs() o where is_approved_pro()
$$;

-- ---------------------------------------------------------------- 3. visibilidade por idade
-- Visível para o profissional atual? aprovado + ativo + nenhuma org do usuário bloqueada +
-- (NOVO) alguma organização aprovada do usuário cobre a idade atual do atleta.
create or replace function athlete_visible_to_pro(p_athlete uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select is_approved_pro()
     and exists (select 1 from athletes a where a.id = p_athlete and a.status = 'approved' and a.visibility = 'active')
     and not exists (
       select 1 from athlete_org_blocks b
       join organization_members m on m.organization_id = b.organization_id
       where b.athlete_id = p_athlete and m.profile_id = public.vp_uid())
     and exists (select 1 from my_approved_orgs() o where athlete_age_allowed(p_athlete, o))
$$;

-- a organização GRAVADA precisa cobrir a idade (membro de duas organizações não usa a outra)
create or replace function guard_org_age() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if not athlete_age_allowed(new.athlete_id, new.organization_id) then raise exception 'age not allowed'; end if;
  return new;
end $$;
create trigger contact_requests_org_age before insert on contact_requests
  for each row execute function guard_org_age();
create trigger pro_notes_org_age before insert or update on pro_notes
  for each row execute function guard_org_age();
create trigger scout_evaluations_org_age before insert or update on scout_evaluations
  for each row execute function guard_org_age();
create trigger pro_tracking_org_age before insert or update on pro_tracking
  for each row execute function guard_org_age();

-- ---------------------------------------------------------------- 4. fase formativa (6 a 10)
create or replace function guard_formative_scores() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from athletes a where a.id = new.athlete_id and athlete_age(a.birth_date) <= 10) then
    raise exception 'formative age';
  end if;
  return new;
end $$;
create trigger scout_evaluations_formative before insert or update on scout_evaluations
  for each row execute function guard_formative_scores();
create trigger ai_analysis_requests_formative before insert on ai_analysis_requests
  for each row execute function guard_formative_scores();

-- ---------------------------------------------------------------- 5. finalidade do interesse
alter table contact_requests
  add column purpose text not null default 'general'
    check (purpose in ('general', 'evaluation_invite', 'scholarship_50', 'scholarship_100', 'school_presentation'));

create or replace function guard_interest_purpose() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_kind text;
begin
  select kind::text into v_kind from organizations where id = new.organization_id;
  if new.purpose in ('scholarship_50', 'scholarship_100', 'school_presentation') and v_kind <> 'school' then
    raise exception 'purpose not allowed';
  end if;
  if new.purpose = 'evaluation_invite' and v_kind not in ('school', 'club', 'scouting_hub') then
    raise exception 'purpose not allowed';
  end if;
  return new;
end $$;
create trigger contact_requests_purpose before insert or update of purpose on contact_requests
  for each row execute function guard_interest_purpose();

-- Envia o interesse com finalidade. Mesmo caminho e mesmas regras de pro_send_interest
-- (visibilidade, mensagem sem contato, limite mensal, uma aberta por atleta, aviso à família).
create or replace function pro_send_proposal(p_athlete uuid, p_message text, p_purpose text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_purpose is null or p_purpose not in ('general', 'evaluation_invite', 'scholarship_50', 'scholarship_100', 'school_presentation') then
    raise exception 'invalid purpose';
  end if;
  v_id := pro_send_interest(p_athlete, p_message);
  update contact_requests set purpose = p_purpose where id = v_id;
  return v_id;
end $$;

-- finalidade dos interesses visíveis para quem pergunta (responsável do atleta ou a organização)
create or replace function interest_purposes(p_ids uuid[]) returns table (id uuid, purpose text)
  language sql stable security definer set search_path = public as $$
  select r.id, r.purpose from contact_requests r
   where r.id = any (p_ids) and public.vp_uid() is not null
     and (is_my_athlete(r.athlete_id) or (is_approved_pro() and r.organization_id in (select my_approved_orgs())))
$$;

-- ---------------------------------------------------------------- permissões
revoke execute on function athlete_age(date) from public, anonymous;
grant execute on function athlete_age(date) to authenticated;
revoke execute on function athletes_age_range_check() from public, anonymous, authenticated;
revoke execute on function org_kind_age_floor(pro_org_kind) from public, anonymous;
revoke execute on function org_age_min(uuid) from public, anonymous, authenticated;
revoke execute on function org_age_max(uuid) from public, anonymous, authenticated;
revoke execute on function athlete_age_allowed(uuid, uuid) from public, anonymous, authenticated;
revoke execute on function admin_set_org_age_band(uuid, int, int, text) from public, anonymous;
grant execute on function admin_set_org_age_band(uuid, int, int, text) to authenticated;
revoke execute on function pro_age_bands() from public, anonymous;
grant execute on function pro_age_bands() to authenticated;
revoke execute on function guard_org_age() from public, anonymous, authenticated;
revoke execute on function guard_formative_scores() from public, anonymous, authenticated;
revoke execute on function guard_interest_purpose() from public, anonymous, authenticated;
revoke execute on function pro_send_proposal(uuid, text, text) from public, anonymous;
grant execute on function pro_send_proposal(uuid, text, text) to authenticated;
revoke execute on function interest_purposes(uuid[]) from public, anonymous;
grant execute on function interest_purposes(uuid[]) to authenticated;
