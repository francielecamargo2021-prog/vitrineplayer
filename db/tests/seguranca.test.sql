-- Verificações de segurança da base Neon (pgTAP). Roda igual no Postgres local e no Neon.
-- Tudo dentro de begin/rollback: nenhum dado fica gravado.
begin;
create extension if not exists pgtap;
select no_plan();

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
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ---------------------------------------------------------------- estrutura
select is((select count(*)::int from pg_tables
  where schemaname in ('public', 'storage') and not rowsecurity and tablename not like '\_tap%'), 0,
  'RLS ligada em todas as tabelas de public e storage');

select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'storage') and p.prosecdef
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), 0,
  'toda função SECURITY DEFINER fixa o search_path');

select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'storage') and p.prosrc ~ '\mauth\.(uid|role|user_id|users|jwt)\M'
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')), 0,
  'nenhuma função da aplicação depende do schema auth');
select is((select count(*)::int from pg_policies where schemaname in ('public', 'storage')
  and (coalesce(qual, '') ~ '\mauth\.' or coalesce(with_check, '') ~ '\mauth\.')), 0,
  'nenhuma regra de acesso depende do schema auth');
select is((select count(*)::int from pg_attrdef d join pg_class c on c.oid = d.adrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'storage') and pg_get_expr(d.adbin, d.adrelid) ~ '\mauth\.'), 0,
  'nenhum valor padrão depende do schema auth');

select ok(exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and tgrelid = 'neon_auth."user"'::regclass and not tgisinternal),
  'gatilho de cadastro ligado à tabela de usuários do Neon Auth');

select ok(not has_schema_privilege('authenticated', 'vp_meta', 'usage') and not has_schema_privilege('anonymous', 'vp_meta', 'usage'),
  'marca do ambiente e registro de migrations inacessíveis aos usuários');
select is((select name from vp_meta.environment), (select name from vp_meta.environment where name in ('local', 'homolog')),
  'banco marcado como local ou homologação (nunca produção aqui)');

select ok(not has_function_privilege('anonymous', 'complete_signup(text,text,text,text[],text,text,text)', 'execute'), 'anônimo não executa complete_signup');
select ok(not has_function_privilege('anonymous', 'admin_review_athlete(uuid,text,text)', 'execute'), 'anônimo não executa admin_review_athlete');
select ok(not has_function_privilege('anonymous', 'admin_review_organization(uuid,text,text)', 'execute'), 'anônimo não executa admin_review_organization');
select ok(not has_function_privilege('authenticated', 'mark_payment_paid(uuid,text,text)', 'execute')
      and not has_function_privilege('anonymous', 'mark_payment_paid(uuid,text,text)', 'execute'), 'só o servidor marca pagamento como pago');
select ok(not has_function_privilege('authenticated', 'ai_claim_jobs(uuid[],uuid)', 'execute')
      and not has_function_privilege('anonymous', 'ai_claim_jobs(uuid[],uuid)', 'execute'), 'só o servidor reserva tarefas da IA');

select is((select count(*)::int from storage.buckets where public), 0, 'nenhum bucket de fotos é público');
select is((select public from storage.buckets where id = 'athlete-photos'), false, 'bucket athlete-photos é privado');

select ok((select rolbypassrls from pg_roles where rolname = current_user),
  'o dono do banco ignora a RLS: consultas em nome de usuários precisam de asUser()');

-- ---------------------------------------------------------------- identificação
select is(public.vp_uid(), null::uuid, 'sem identificação, vp_uid() é nulo');
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
select is(public.vp_uid(), 'e0000000-0000-0000-0000-0000000000e1'::uuid, 'vp_uid() lê o usuário da requisição');
select is(public.request_role(), 'authenticated', 'request_role() lê o papel da requisição');
select pg_temp.as_owner();

-- ---------------------------------------------------------------- cadastro em 2 passos
insert into neon_auth."user" (id, name, email, "emailVerified") values
  ('e0000000-0000-0000-0000-0000000000e1', 'Resp Seg A', 'seg-a@test.dev', false),
  ('e0000000-0000-0000-0000-0000000000e2', 'Resp Seg B', 'seg-b@test.dev', false);
select is((select role::text from profiles where id = 'e0000000-0000-0000-0000-0000000000e1'), 'RESPONSIBLE', 'conta nova vira RESPONSIBLE');
select is((select country from profiles where id = 'e0000000-0000-0000-0000-0000000000e1'), null, 'perfil nasce sem país (vem no 2º passo)');

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select complete_signup('+5511999990009', 'BR', 'pt-BR', array['terms'], 'v1') $$, 'P0001', 'not allowed',
  'complete_signup sem usuário identificado é recusado');
select pg_temp.as_anon();
select throws_ok($$ select complete_signup('+5511999990009', 'BR', 'pt-BR', array['terms'], 'v1') $$, '42501', null,
  'anônimo não consegue chamar complete_signup');

select pg_temp.as_user('e0000000-0000-0000-0000-0000000000e1');
select lives_ok($$ select complete_signup('+5511999990001', 'br', 'xx', array['terms', 'privacy', 'invalido'], '2026-10') $$,
  'usuário completa o próprio cadastro');
select pg_temp.as_owner();
select is((select country from profiles where id = 'e0000000-0000-0000-0000-0000000000e1'), 'BR', 'país normalizado para ISO');
select is((select locale from profiles where id = 'e0000000-0000-0000-0000-0000000000e1'), 'pt-BR', 'idioma desconhecido vira pt-BR');
select is((select count(*)::int from consents where profile_id = 'e0000000-0000-0000-0000-0000000000e1'), 2, 'só consentimentos conhecidos são gravados');

select pg_temp.as_user('e0000000-0000-0000-0000-0000000000e1');
select throws_ok($$ select complete_signup('+5511000000000', 'AR', 'es', array['terms'], 'v2') $$, 'P0001', 'signup already completed',
  'cadastro não pode ser completado duas vezes');
select pg_temp.as_user('e0000000-0000-0000-0000-0000000000e2');
select lives_ok($$ select complete_signup('+5511999990002', 'Brasil', 'es', array['terms'], 'v1') $$, 'outro usuário completa o próprio cadastro');
select pg_temp.as_owner();
select is((select country from profiles where id = 'e0000000-0000-0000-0000-0000000000e2'), null, 'país fora do padrão ISO é descartado');
select is((select whatsapp from profiles where id = 'e0000000-0000-0000-0000-0000000000e1'), '+5511999990001', 'cadastro de B não altera os dados de A');

-- ---------------------------------------------------------------- isolamento básico
select pg_temp.as_user('e0000000-0000-0000-0000-0000000000e1');
select is((select count(*)::int from profiles), 1, 'usuário vê só o próprio perfil');
select is((select count(*)::int from consents), 2, 'usuário vê só os próprios consentimentos');
select throws_ok($$ update profiles set role = 'ADMIN' where id = 'e0000000-0000-0000-0000-0000000000e1' $$, 'P0001', 'campo não editável',
  'usuário não consegue se promover a ADMIN');
select pg_temp.as_anon();
select is((select count(*)::int from profiles), 0, 'anônimo não vê perfis');
select is((select count(*)::int from athletes), 0, 'anônimo não vê atletas');
select is((select count(*)::int from storage.objects), 0, 'anônimo não vê registros de fotos');
select throws_ok($$ insert into profiles (id, role, full_name, email) values (gen_random_uuid(), 'ADMIN', 'x', 'x@x.dev') $$, '42501', null,
  'anônimo não cria perfis');
select pg_temp.as_owner();

select * from finish();
rollback;
