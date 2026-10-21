-- =============================================================================
-- VITRINEPLAYER — LGPD: exclusão de conta e exportação dos dados (fase C5).
--
--  * Excluir a conta apaga: o login (Neon Auth), o perfil, os consentimentos, os
--    atletas dos quais a pessoa é a ÚNICA responsável (com fotos, vídeos, relatórios,
--    interesses recebidos e bloqueios, em cascata) e as visualizações feitas por ela.
--  * Registros de terceiros que citavam a pessoa ficam ANONIMIZADOS (autor = vazio):
--    auditoria, decisões de revisão, notas/avaliações/listas de organizações,
--    interesses enviados por profissionais.
--  * Profissional: deixa a equipe. Se era o dono, o membro mais antigo vira dono; se
--    era o único membro, os dados de contato da organização são apagados e ela fica
--    suspensa ("conta encerrada").
--  * Quem pede: a própria pessoa (área da conta) ou o admin, com motivo (pedido
--    recebido por outro canal). Admin não se exclui por aqui.
--  * O servidor apaga depois os arquivos de foto no Vercel Blob (endereços devolvidos).
--  * Exportação: tudo o que a plataforma guarda sobre a pessoa, em JSON.
-- =============================================================================

-- ---------------------------------------------------------------- referências que não podem impedir a exclusão
alter table organizations drop constraint organizations_reviewed_by_fkey,
  add constraint organizations_reviewed_by_fkey foreign key (reviewed_by) references profiles (id) on delete set null;
alter table athletes drop constraint athletes_reviewed_by_fkey,
  add constraint athletes_reviewed_by_fkey foreign key (reviewed_by) references profiles (id) on delete set null;
alter table payments alter column payer_id drop not null, drop constraint payments_payer_id_fkey,
  add constraint payments_payer_id_fkey foreign key (payer_id) references profiles (id) on delete set null;
alter table pro_lists alter column created_by drop not null, drop constraint pro_lists_created_by_fkey,
  add constraint pro_lists_created_by_fkey foreign key (created_by) references profiles (id) on delete set null;
alter table pro_list_items alter column added_by drop not null, drop constraint pro_list_items_added_by_fkey,
  add constraint pro_list_items_added_by_fkey foreign key (added_by) references profiles (id) on delete set null;
alter table pro_notes alter column author_id drop not null, drop constraint pro_notes_author_id_fkey,
  add constraint pro_notes_author_id_fkey foreign key (author_id) references profiles (id) on delete set null;
alter table scout_evaluations alter column author_id drop not null, drop constraint scout_evaluations_author_id_fkey,
  add constraint scout_evaluations_author_id_fkey foreign key (author_id) references profiles (id) on delete set null;
alter table athlete_views drop constraint athlete_views_viewer_id_fkey,
  add constraint athlete_views_viewer_id_fkey foreign key (viewer_id) references profiles (id) on delete cascade;
alter table contact_requests alter column requested_by drop not null, drop constraint contact_requests_requested_by_fkey,
  add constraint contact_requests_requested_by_fkey foreign key (requested_by) references profiles (id) on delete set null;
alter table audit_log drop constraint audit_log_actor_id_fkey,
  add constraint audit_log_actor_id_fkey foreign key (actor_id) references profiles (id) on delete set null;
alter table athlete_org_blocks alter column created_by drop not null, drop constraint athlete_org_blocks_created_by_fkey,
  add constraint athlete_org_blocks_created_by_fkey foreign key (created_by) references profiles (id) on delete set null;
alter table ai_analysis_grants drop constraint ai_analysis_grants_granted_by_fkey,
  add constraint ai_analysis_grants_granted_by_fkey foreign key (granted_by) references profiles (id) on delete set null;
alter table ai_analysis_requests alter column requested_by drop not null, drop constraint ai_analysis_requests_requested_by_fkey,
  add constraint ai_analysis_requests_requested_by_fkey foreign key (requested_by) references profiles (id) on delete set null;
alter table ai_analysis_requests alter column consent_id drop not null, drop constraint ai_analysis_requests_consent_id_fkey,
  add constraint ai_analysis_requests_consent_id_fkey foreign key (consent_id) references consents (id) on delete set null;

-- ---------------------------------------------------------------- exportação
create or replace function account_export(p_profile uuid) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare v jsonb; my_athletes uuid[];
begin
  if public.vp_uid() is null or not (p_profile = public.vp_uid() or is_admin()) then raise exception 'not allowed'; end if;
  select array(select athlete_id from athlete_guardians where profile_id = p_profile) into my_athletes;
  select jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'whatsapp', p.whatsapp,
                  'country', p.country, 'locale', p.locale, 'role', p.role, 'created_at', p.created_at) from profiles p where p.id = p_profile),
    'consents', (select coalesce(jsonb_agg(jsonb_build_object('kind', c.kind, 'version', c.version, 'athlete_id', c.athlete_id,
                  'granted_at', c.granted_at, 'revoked_at', c.revoked_at) order by c.granted_at), '[]') from consents c where c.profile_id = p_profile),
    'athletes', (select coalesce(jsonb_agg(
                    (to_jsonb(a) - 'reviewed_by' - 'review_note')
                    || jsonb_build_object(
                      'relation', (select g.relation from athlete_guardians g where g.athlete_id = a.id and g.profile_id = p_profile),
                      'media', (select coalesce(jsonb_agg(jsonb_build_object('kind', m.kind, 'youtube', m.external_id, 'photo', m.storage_path,
                                 'title', m.title, 'created_at', m.created_at)), '[]') from athlete_media m where m.athlete_id = a.id),
                      'clubs', (select coalesce(jsonb_agg(to_jsonb(c) - 'id' - 'athlete_id'), '[]') from athlete_clubs c where c.athlete_id = a.id),
                      'achievements', (select coalesce(jsonb_agg(to_jsonb(x) - 'id' - 'athlete_id'), '[]') from athlete_achievements x where x.athlete_id = a.id),
                      'interests_received', (select coalesce(jsonb_agg(jsonb_build_object('organization', o.name, 'message', r.message,
                                 'status', interest_status(r.status, r.created_at), 'created_at', r.created_at)), '[]')
                                 from contact_requests r join organizations o on o.id = r.organization_id where r.athlete_id = a.id),
                      'blocked_organizations', (select coalesce(jsonb_agg(o.name), '[]') from athlete_org_blocks b join organizations o on o.id = b.organization_id where b.athlete_id = a.id),
                      'ai_reports', (select coalesce(jsonb_agg(jsonb_build_object('summary', r.summary, 'overall_score', r.overall_score,
                                 'published_at', r.published_at, 'created_at', r.created_at)), '[]') from ai_video_reports r where r.athlete_id = a.id)
                    )), '[]')
                  from athletes a where a.id = any (my_athletes)),
    'organizations', (select coalesce(jsonb_agg(jsonb_build_object('name', o.name, 'kind', o.kind, 'status', o.status, 'is_owner', m.is_owner,
                  'document', o.document, 'license', o.license, 'website', o.website)), '[]')
                  from organization_members m join organizations o on o.id = m.organization_id where m.profile_id = p_profile),
    'notes_written', (select coalesce(jsonb_agg(jsonb_build_object('athlete_id', n.athlete_id, 'body', n.body, 'created_at', n.created_at)), '[]')
                  from pro_notes n where n.author_id = p_profile),
    'evaluations_written', (select coalesce(jsonb_agg(jsonb_build_object('athlete_id', e.athlete_id, 'scores', e.scores, 'observation', e.observation,
                  'created_at', e.created_at)), '[]') from scout_evaluations e where e.author_id = p_profile),
    'interests_sent', (select coalesce(jsonb_agg(jsonb_build_object('athlete_id', r.athlete_id, 'message', r.message,
                  'status', interest_status(r.status, r.created_at), 'created_at', r.created_at)), '[]') from contact_requests r where r.requested_by = p_profile),
    'favorites', (select coalesce(jsonb_agg(f.athlete_id), '[]') from pro_favorites f where f.profile_id = p_profile)
  ) into v;
  insert into audit_log (actor_id, action, entity, entity_id) values (public.vp_uid(), 'account.export', 'profiles', p_profile);
  return v;
end $$;

-- ---------------------------------------------------------------- exclusão
-- Devolve os endereços das fotos no Blob para o servidor apagar os arquivos.
create or replace function account_delete(p_profile uuid, p_reason text default null) returns text[]
  language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := public.vp_uid();
  v_role app_role;
  v_blobs text[];
  v_orphans uuid[];
  r record;
  v_next uuid;
begin
  if v_actor is null then raise exception 'not allowed'; end if;
  select role into v_role from profiles where id = p_profile for update;
  if v_role is null then raise exception 'profile not found'; end if;
  if v_role = 'ADMIN' then raise exception 'not allowed'; end if;
  if p_profile <> v_actor then
    if not is_admin() then raise exception 'not allowed'; end if;
    if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'note required'; end if;
  end if;

  -- atletas em que a pessoa é a única responsável saem junto (com tudo o que é deles)
  select array(select g.athlete_id from athlete_guardians g where g.profile_id = p_profile
                 and not exists (select 1 from athlete_guardians o where o.athlete_id = g.athlete_id and o.profile_id <> p_profile))
    into v_orphans;
  select array(select o.blob_url from storage.objects o
                where o.bucket_id = 'athlete-photos' and o.blob_url is not null
                  and split_part(o.name, '/', 1) = any (select x::text from unnest(v_orphans) x))
    into v_blobs;
  delete from storage.objects where bucket_id = 'athlete-photos' and split_part(name, '/', 1) = any (select x::text from unnest(v_orphans) x);
  delete from contact_requests where athlete_id = any (v_orphans);
  delete from athletes where id = any (v_orphans);

  -- organizações: passa a posse ou encerra a que fica sem ninguém
  for r in select m.organization_id, m.is_owner from organization_members m where m.profile_id = p_profile loop
    delete from organization_members where organization_id = r.organization_id and profile_id = p_profile;
    select m.profile_id into v_next from organization_members m join profiles p on p.id = m.profile_id
     where m.organization_id = r.organization_id order by p.created_at limit 1;
    if v_next is null then
      update organizations set contact_name = null, contact_email = null, contact_phone = null, document = null, license = null,
             about = null, status = 'suspended', review_note = 'Conta encerrada a pedido do titular'
       where id = r.organization_id;
      update organization_invites set revoked_at = now() where organization_id = r.organization_id and used_at is null and revoked_at is null;
    elsif r.is_owner then
      update organization_members set is_owner = true where organization_id = r.organization_id and profile_id = v_next;
      update organizations set contact_name = (select full_name from profiles where id = v_next),
             contact_email = (select email from profiles where id = v_next),
             contact_phone = (select whatsapp from profiles where id = v_next)
       where id = r.organization_id;
    end if;
  end loop;

  insert into audit_log (actor_id, action, entity, meta)
  values (case when p_profile = v_actor then null else v_actor end, 'account.delete', 'profiles',
          jsonb_build_object('by', case when p_profile = v_actor then 'self' else 'admin' end, 'reason', nullif(trim(coalesce(p_reason, '')), ''),
                             'athletes_removed', coalesce(cardinality(v_orphans), 0)));
  -- login e perfil (o perfil sai em cascata; referências de terceiros ficam anônimas)
  delete from neon_auth."user" where id = p_profile;
  return coalesce(v_blobs, '{}');
end $$;

revoke execute on function account_export(uuid), account_delete(uuid, text) from public, anonymous;
grant execute on function account_export(uuid), account_delete(uuid, text) to authenticated;
