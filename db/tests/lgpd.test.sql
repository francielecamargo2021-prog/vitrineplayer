-- LGPD (0011): exportação dos dados e exclusão da conta (pela pessoa ou pelo admin, com
-- motivo), anonimização de registros de terceiros e passagem da organização.
-- Tudo dentro de begin/rollback.
begin;
create extension if not exists pgtap;
select no_plan();

create function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_admin(p_id uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  insert into admin_mfa_sessions (token_hash, profile_id, expires_at)
  values (encode(sha256(convert_to('teste-' || p_id, 'UTF8')), 'hex'), p_id, now() + interval '1 hour') on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'vp_mfa', 'teste-' || p_id)::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

create temp table ids (k text primary key, id uuid) on commit drop;
create temp table tok (k text primary key, v text) on commit drop;
grant all on ids, tok to authenticated;

insert into neon_auth."user" (id, name, email, "emailVerified") values
  ('1d000000-0000-0000-0000-0000000000a1', 'Mãe Lgpd', 'lgpd-g1@test.dev', true),
  ('1d000000-0000-0000-0000-0000000000a2', 'Pai Lgpd', 'lgpd-g2@test.dev', true),
  ('1d000000-0000-0000-0000-0000000000b1', 'Dona Clube', 'lgpd-p1@test.dev', true),
  ('1d000000-0000-0000-0000-0000000000b2', 'Colega Clube', 'lgpd-p2@test.dev', true),
  ('1d000000-0000-0000-0000-0000000000c1', 'Admin Lgpd', 'lgpd-admin@test.dev', true);
update profiles set role = 'ADMIN' where id = '1d000000-0000-0000-0000-0000000000c1';

-- família 1: atleta só dela, com foto; família 2: atleta próprio
select pg_temp.as_user('1d000000-0000-0000-0000-0000000000a1');
select complete_signup('+5511911110001', 'BR', 'pt-BR', array['terms', 'privacy', 'guardian_declaration', 'no_guarantee'], 'v');
insert into ids values ('ath', create_athlete('Joana Lgpd Silva', 'Joaninha', (current_date - interval '13 years')::date, 'BR', 'mother'));
select pg_temp.as_owner();
insert into storage.objects (bucket_id, name, blob_url) select 'athlete-photos', id || '/f.webp', 'atletas/' || id || '/f.webp' from ids where k = 'ath';
insert into athlete_media (athlete_id, kind, storage_path, is_primary) select id, 'photo', id || '/f.webp', true from ids where k = 'ath';
select pg_temp.as_service();
update athletes set status = 'approved', approved_at = now() where id = (select id from ids where k = 'ath');
select pg_temp.as_user('1d000000-0000-0000-0000-0000000000a2');
insert into ids values ('ath2', create_athlete('Caio Lgpd', 'Caio', (current_date - interval '14 years')::date, 'BR', 'father'));
select pg_temp.as_service();
update athletes set status = 'approved', approved_at = now() where id = (select id from ids where k = 'ath2');

-- clube com dona e colega; nota sobre o atleta da família 2, interesse no atleta da família 1
select pg_temp.as_user('1d000000-0000-0000-0000-0000000000b1');
insert into ids values ('org', complete_professional_signup('+5511922220001', 'BR', 'pt-BR', array['terms', 'privacy', 'pro_conduct'], 'v',
  '{"name":"Clube Lgpd","kind":"club","document":"12.345","contact_role":"Diretora"}'));
select pg_temp.as_admin('1d000000-0000-0000-0000-0000000000c1');
select admin_review_organization((select id from ids where k = 'org'), 'approve');
select pg_temp.as_user('1d000000-0000-0000-0000-0000000000b1');
insert into tok values ('inv', org_invite_create());
select pg_temp.as_user('1d000000-0000-0000-0000-0000000000b2');
select complete_professional_join('+5511922220002', 'BR', 'pt-BR', array['terms', 'privacy', 'pro_conduct'], 'v', (select v from tok where k = 'inv'));
select pg_temp.as_user('1d000000-0000-0000-0000-0000000000b1');
insert into pro_notes (organization_id, athlete_id, author_id, body) values ((select id from ids where k = 'org'), (select id from ids where k = 'ath2'), public.vp_uid(), 'Zagueiro forte');
insert into ids values ('req', pro_send_interest((select id from ids where k = 'ath'), 'Queremos conhecer melhor a atleta no clube.'));

-- ================================================================ exportação
select pg_temp.as_user('1d000000-0000-0000-0000-0000000000a1');
create temp table exp on commit drop as select account_export('1d000000-0000-0000-0000-0000000000a1') as j;
select is((select j->'account'->>'email' from exp), 'lgpd-g1@test.dev', 'exportação traz a conta');
select is((select jsonb_array_length(j->'athletes') from exp), 1, 'e os atletas sob responsabilidade');
select is((select jsonb_array_length(j->'athletes'->0->'interests_received') from exp), 1, 'com os interesses recebidos');
select ok((select jsonb_array_length(j->'consents') from exp) >= 4, 'e os consentimentos');
select ok(not ((select j->'athletes'->0 from exp) ? 'review_note'), 'sem notas internas do admin');
select throws_ok($$ select account_export('1d000000-0000-0000-0000-0000000000a2') $$, 'P0001', 'not allowed', 'ninguém exporta dados de outra pessoa');

-- ================================================================ exclusão pela própria família
select is(account_delete('1d000000-0000-0000-0000-0000000000a1'), array['atletas/' || (select id from ids where k = 'ath') || '/f.webp'],
  'família exclui a conta e recebe os arquivos para apagar do Blob');
select pg_temp.as_owner();
select is((select count(*)::int from neon_auth."user" where id = '1d000000-0000-0000-0000-0000000000a1'), 0, 'login apagado');
select is((select count(*)::int from profiles where id = '1d000000-0000-0000-0000-0000000000a1'), 0, 'perfil apagado');
select is((select count(*)::int from consents where profile_id = '1d000000-0000-0000-0000-0000000000a1'), 0, 'consentimentos apagados');
select is((select count(*)::int from athletes where id = (select id from ids where k = 'ath')), 0, 'atleta sob responsabilidade única apagado');
select is((select count(*)::int from storage.objects where name like (select id from ids where k = 'ath') || '/%'), 0, 'registro das fotos apagado');
select is((select count(*)::int from contact_requests where id = (select id from ids where k = 'req')), 0, 'interesses recebidos apagados');
select ok(exists (select 1 from audit_log where action = 'account.delete' and actor_id is null), 'auditoria registra a exclusão, sem identificar a pessoa');

-- ================================================================ profissional sai: posse passa ao colega
select pg_temp.as_user('1d000000-0000-0000-0000-0000000000b1');
select is(cardinality(account_delete('1d000000-0000-0000-0000-0000000000b1')), 0, 'dona do clube exclui a conta');
select pg_temp.as_owner();
select is((select is_owner from organization_members where profile_id = '1d000000-0000-0000-0000-0000000000b2'), true, 'colega mais antigo vira dono');
select is((select contact_email from organizations where id = (select id from ids where k = 'org')), 'lgpd-p2@test.dev', 'contato da organização passa a ser o do novo dono');
select is((select status::text from organizations where id = (select id from ids where k = 'org')), 'approved', 'organização continua ativa');
select ok((select author_id from pro_notes where organization_id = (select id from ids where k = 'org')) is null, 'nota fica com a organização, sem autor identificado');

-- ================================================================ exclusão a pedido, pelo admin
select pg_temp.as_user('1d000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select account_delete('1d000000-0000-0000-0000-0000000000b2') $$, 'P0001', 'not allowed', 'ninguém exclui a conta de outra pessoa');
select pg_temp.as_admin('1d000000-0000-0000-0000-0000000000c1');
select throws_ok($$ select account_delete('1d000000-0000-0000-0000-0000000000b2') $$, 'P0001', 'note required', 'admin precisa registrar o pedido');
select throws_ok($$ select account_delete('1d000000-0000-0000-0000-0000000000c1', 'teste de admin') $$, 'P0001', 'not allowed', 'admin não é excluído por aqui');
select lives_ok($$ select account_delete('1d000000-0000-0000-0000-0000000000b2', 'Pedido por e-mail em 21/10') $$, 'admin exclui a pedido do titular');
select pg_temp.as_owner();
select is((select status::text from organizations where id = (select id from ids where k = 'org')), 'suspended', 'organização sem ninguém fica encerrada');
select ok((select contact_email is null and document is null from organizations where id = (select id from ids where k = 'org')), 'e sem dados pessoais de contato');
select is((select count(*)::int from athletes where id = (select id from ids where k = 'ath2')), 1, 'atletas de outras famílias não são afetados');

select * from finish();
rollback;
