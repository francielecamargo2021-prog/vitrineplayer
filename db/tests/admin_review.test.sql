-- Revisão pelo administrador (0005). Rodar: npx supabase test db
-- Cenário: admin X; responsável A com atleta pago (em revisão); profissional P
-- em organização pendente; anônimo.
begin;
create extension if not exists pgtap;
select no_plan();

-- [neon] cadastro de teste = usuário no Neon Auth + complete_signup() (como a Server Action)
create temp table vp_test_signup (id uuid, email text, raw_user_meta_data jsonb) on commit drop;
create function pg_temp.vp_signup() returns trigger language plpgsql as $vp$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'); prev text := current_setting('request.jwt.claims', true);
begin
  insert into neon_auth."user" (id, name, email, "emailVerified") values (new.id, coalesce(m->>'full_name', ''), new.email, false);
  if m ? 'whatsapp' or m ? 'consents' or m ? 'country' then
    perform set_config('request.jwt.claims', json_build_object('sub', new.id, 'role', 'authenticated')::text, true);
    perform complete_signup(m->>'whatsapp', m->>'country', m->>'locale',
      array(select jsonb_array_elements_text(coalesce(m->'consents', '[]'))), m->>'consent_version', m->>'consent_ip', m->>'consent_ua');
    perform set_config('request.jwt.claims', coalesce(prev, ''), true);
  end if;
  return new;
end $vp$;
create trigger vp_signup after insert on vp_test_signup for each row execute function pg_temp.vp_signup();

-- admin COM segundo fator: sessão de teste no banco + prova na requisição (0010)
create function pg_temp.as_admin(p_id uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  insert into admin_mfa_sessions (token_hash, profile_id, expires_at)
  values (encode(sha256(convert_to('teste-' || p_id, 'UTF8')), 'hex'), p_id, now() + interval '1 hour') on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'vp_mfa', 'teste-' || p_id)::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anonymous"}', true);
  execute 'set local role anonymous';
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;

insert into vp_test_signup (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-00000000000a', 'a@test.dev', '{"full_name":"Resp A"}'),
  ('e0000000-0000-0000-0000-0000000000e1', 'x@test.dev', '{"full_name":"Admin X"}'),
  ('c0000000-0000-0000-0000-0000000000c1', 'p@test.dev', '{"full_name":"Pro P"}');
update profiles set role = 'ADMIN' where id = 'e0000000-0000-0000-0000-0000000000e1';
update profiles set role = 'PROFESSIONAL' where id = 'c0000000-0000-0000-0000-0000000000c1';
insert into organizations (id, name, kind, country, status) values
  ('d0000000-0000-0000-0000-0000000000d1', 'Clube Teste', 'club', 'BR', 'pending');
insert into organization_members (organization_id, profile_id) values
  ('d0000000-0000-0000-0000-0000000000d1', 'c0000000-0000-0000-0000-0000000000c1');

create temp table ids (k text primary key, id uuid) on commit drop;
grant all on ids to authenticated, anonymous;

select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
insert into ids values ('ath', create_athlete('Atleta Teste', 'Teste', '2011-03-10', 'BR'));
insert into ids values ('draft', create_athlete('Atleta Rascunho', 'Rascunho', '2012-05-01', 'BR'));

-- [0007] cadastro gratuito: o responsável completa o perfil e envia para revisão
update athletes set primary_position = 'CM', modality = 'field', category = 'Sub-15', status = 'in_review'
  where id = (select id from ids where k = 'ath');
select pg_temp.as_service();
insert into storage.objects (bucket_id, name) values
  ('athlete-photos', (select id from ids where k = 'ath') || '/foto.webp');
select is((select status::text from athletes where id = (select id from ids where k = 'ath')), 'in_review', 'perfil completo vai para revisão sem pagamento');

select has_function('public', 'admin_review_athlete', array['uuid', 'text', 'text'], 'admin_review_athlete existe');
select has_function('public', 'admin_review_organization', array['uuid', 'text', 'text'], 'admin_review_organization existe');

-- ---------------------------------------------------------------- quem NÃO pode decidir
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select throws_ok(format($$ select admin_review_athlete(%L, 'approve') $$, (select id from ids where k = 'ath')),
  'P0001', 'not allowed', 'responsável não aprova o próprio atleta');
select throws_ok($$ select admin_review_organization('d0000000-0000-0000-0000-0000000000d1', 'approve') $$,
  'P0001', 'not allowed', 'responsável não aprova organização');

select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c1');
select throws_ok($$ select admin_review_organization('d0000000-0000-0000-0000-0000000000d1', 'approve') $$,
  'P0001', 'not allowed', 'profissional não aprova a própria organização');

select pg_temp.as_service();
select throws_ok(format($$ select admin_review_athlete(%L, 'approve') $$, (select id from ids where k = 'ath')),
  'P0001', 'not allowed', 'service role não decide revisões (só admin humano)');

select pg_temp.as_anon();
select throws_ok($$ select admin_review_organization('d0000000-0000-0000-0000-0000000000d1', 'approve') $$,
  '42501', null, 'anônimo não executa as funções de revisão');

-- ---------------------------------------------------------------- admin: atleta
select pg_temp.as_admin('e0000000-0000-0000-0000-0000000000e1');
select is((select count(*)::int from storage.objects where name like (select id from ids where k = 'ath') || '/%'), 1,
  'admin lê as fotos do atleta em revisão');
select throws_ok(format($$ select admin_review_athlete(%L, 'approve') $$, (select id from ids where k = 'draft')),
  'P0001', 'invalid transition', 'rascunho (sem pagamento) não pode ser aprovado');
select throws_ok(format($$ select admin_review_athlete(%L, 'reject', 'ok') $$, (select id from ids where k = 'ath')),
  'P0001', 'note required', 'rejeitar exige motivo');
select throws_ok(format($$ select admin_review_athlete(%L, 'whatever') $$, (select id from ids where k = 'ath')),
  'P0001', 'invalid transition', 'decisão desconhecida é recusada');

select is(admin_review_athlete((select id from ids where k = 'ath'), 'reject', 'Foto principal sem o atleta'), 'rejected'::athlete_status,
  'admin rejeita com motivo');
select is((select review_note from athletes where id = (select id from ids where k = 'ath')), 'Foto principal sem o atleta',
  'motivo fica gravado para o responsável');

-- responsável corrige e reenvia (regra de 0002: rejeitado + pago → revisão)
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
update athletes set status = 'in_review' where id = (select id from ids where k = 'ath');
select is((select status::text from athletes where id = (select id from ids where k = 'ath')), 'in_review', 'responsável reenvia após rejeição');

select pg_temp.as_admin('e0000000-0000-0000-0000-0000000000e1');
select is(admin_review_athlete((select id from ids where k = 'ath'), 'approve'), 'approved'::athlete_status, 'admin aprova');
select ok((select approved_at is not null and reviewed_by = 'e0000000-0000-0000-0000-0000000000e1'
           from athletes where id = (select id from ids where k = 'ath')), 'aprovação grava data e autor');
select is((select review_note from athletes where id = (select id from ids where k = 'ath')), null, 'aprovação limpa o motivo anterior');
select is((select count(*)::int from audit_log where entity_id = (select id from ids where k = 'ath') and action like 'athlete.review.%'), 2,
  'cada decisão vai para a auditoria');
select is((select array_agg(template order by scheduled_at, template)::text from notification_outbox where profile_id = 'a0000000-0000-0000-0000-00000000000a'),
  '{profile_approved,profile_rejected}', 'responsável é avisado de cada decisão');
select throws_ok(format($$ select admin_review_athlete(%L, 'approve') $$, (select id from ids where k = 'ath')),
  'P0001', 'invalid transition', 'aprovar duas vezes é recusado');

-- ---------------------------------------------------------------- admin: organização
select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from pro_search_athletes()), 0, 'profissional de organização pendente não vê atletas');

select pg_temp.as_admin('e0000000-0000-0000-0000-0000000000e1');
select throws_ok($$ select admin_review_organization('d0000000-0000-0000-0000-0000000000d1', 'suspend', 'motivo qualquer') $$,
  'P0001', 'invalid transition', 'organização pendente não pode ser suspensa');
select is(admin_review_organization('d0000000-0000-0000-0000-0000000000d1', 'approve'), 'approved'::review_status, 'admin aprova a organização');
select ok((select reviewed_at is not null from organizations where id = 'd0000000-0000-0000-0000-0000000000d1'), 'aprovação da organização grava data');

select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from pro_search_athletes()), 1, 'profissional aprovado passa a ver o atleta aprovado');

-- suspensões
select pg_temp.as_admin('e0000000-0000-0000-0000-0000000000e1');
select throws_ok(format($$ select admin_review_athlete(%L, 'suspend') $$, (select id from ids where k = 'ath')),
  'P0001', 'note required', 'suspender atleta exige motivo');
select is(admin_review_athlete((select id from ids where k = 'ath'), 'suspend', 'Denúncia em verificação'), 'suspended'::athlete_status, 'admin suspende atleta');
select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from pro_search_athletes()), 0, 'atleta suspenso some para profissionais');

select pg_temp.as_admin('e0000000-0000-0000-0000-0000000000e1');
select is(admin_review_athlete((select id from ids where k = 'ath'), 'reinstate'), 'approved'::athlete_status, 'admin reativa atleta');
select is(admin_review_organization('d0000000-0000-0000-0000-0000000000d1', 'suspend', 'Documento vencido'), 'suspended'::review_status, 'admin suspende organização');
select pg_temp.as_user('c0000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from pro_search_athletes()), 0, 'organização suspensa perde o acesso');

-- responsável não muda o próprio status para aprovado
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select throws_ok(format($$ update athletes set status = 'approved' where id = %L $$, (select id from ids where k = 'draft')),
  'P0001', null, 'responsável não se autoaprova (regra de 0002 preservada)');

select * from finish();
rollback;
