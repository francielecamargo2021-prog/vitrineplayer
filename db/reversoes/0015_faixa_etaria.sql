-- Reversão da migration 0015_faixa_etaria.sql (NÃO é aplicada automaticamente).
-- Desfaz só o que a 0015 criou e devolve athlete_visible_to_pro à versão de 0002.
-- Uso (somente com autorização): no branch certo, numa transação. Depois, o app volta ao
-- commit anterior ao da faixa etária no banco (as funções abaixo deixam de existir).
-- Atenção: a finalidade dos interesses (convite, bolsa) e as faixas autorizadas pelo admin
-- são apagadas; o interesse em si continua.
begin;
-- gatilhos
drop trigger if exists athletes_age_range on athletes;
drop trigger if exists contact_requests_org_age on contact_requests;
drop trigger if exists pro_notes_org_age on pro_notes;
drop trigger if exists scout_evaluations_org_age on scout_evaluations;
drop trigger if exists pro_tracking_org_age on pro_tracking;
drop trigger if exists scout_evaluations_formative on scout_evaluations;
drop trigger if exists ai_analysis_requests_formative on ai_analysis_requests;
drop trigger if exists contact_requests_purpose on contact_requests;
-- funções novas
drop function if exists interest_purposes(uuid[]);
drop function if exists pro_send_proposal(uuid, text, text);
drop function if exists guard_interest_purpose();
drop function if exists guard_formative_scores();
drop function if exists guard_org_age();
drop function if exists pro_age_bands();
drop function if exists admin_set_org_age_band(uuid, int, int, text);
-- visibilidade: versão de 0002 (antes de athlete_age_allowed deixar de existir)
create or replace function athlete_visible_to_pro(p_athlete uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select is_approved_pro()
     and exists (select 1 from athletes a where a.id = p_athlete and a.status = 'approved' and a.visibility = 'active')
     and not exists (
       select 1 from athlete_org_blocks b
       join organization_members m on m.organization_id = b.organization_id
       where b.athlete_id = p_athlete and m.profile_id = public.vp_uid())
$$;
drop function if exists athlete_age_allowed(uuid, uuid);
drop function if exists org_age_min(uuid);
drop function if exists org_age_max(uuid);
drop function if exists org_kind_age_floor(pro_org_kind);
drop function if exists athletes_age_range_check();
drop function if exists athlete_age(date);
-- colunas
alter table contact_requests drop column if exists purpose;
alter table organizations drop constraint if exists organizations_age_band;
alter table organizations drop column if exists age_band_at, drop column if exists age_band_by,
                          drop column if exists athlete_age_max, drop column if exists athlete_age_min;
-- registro, para o migrar.mjs voltar a ver a 0015 como pendente
delete from vp_meta.migrations where arquivo = '0015_faixa_etaria.sql';
commit;
