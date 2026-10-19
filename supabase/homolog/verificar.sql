-- =============================================================================
-- VERIFICAÇÃO DA HOMOLOGAÇÃO (somente leitura — não altera nada)
-- Cole no SQL Editor e clique em Run. Todas as linhas devem mostrar ok = true.
-- =============================================================================
with
expected_tables (t) as (values
  ('profiles'), ('organizations'), ('organization_members'), ('athletes'), ('athlete_clubs'),
  ('athlete_media'), ('consents'), ('payments'), ('pro_lists'), ('pro_list_items'), ('pro_favorites'),
  ('pro_notes'), ('scout_evaluations'), ('athlete_views'), ('contact_requests'), ('notification_outbox'),
  ('audit_log'), ('athlete_guardians'), ('athlete_achievements'), ('athlete_org_blocks'),
  ('ai_settings'), ('ai_analysis_grants'), ('ai_analysis_requests'), ('ai_batches'),
  ('ai_analysis_jobs'), ('ai_video_reports'), ('ai_report_scores')),
service_only (f) as (values
  ('mark_payment_paid'), ('ai_claim_jobs'), ('ai_release_jobs'), ('ai_complete_job'),
  ('ai_add_job_cost'), ('ai_spent_since'), ('ai_set_request_status')),
checks (ordem, verificacao, ok, detalhe) as (
  select 1, 'Projeto marcado como homologação',
         exists (select 1 from vp_meta.environment where name = 'homolog'),
         (select string_agg(label, ', ') from vp_meta.environment)
  union all
  select 2, 'Migrations 0001–0005 registradas',
         (select count(*) from supabase_migrations.schema_migrations where version in ('0001','0002','0003','0004','0005')) = 5,
         (select string_agg(version || '_' || name, ', ' order by version) from supabase_migrations.schema_migrations)
  union all
  select 3, 'Todas as tabelas esperadas existem',
         not exists (select 1 from expected_tables e where to_regclass('public.' || e.t) is null),
         coalesce((select 'faltando: ' || string_agg(e.t, ', ') from expected_tables e where to_regclass('public.' || e.t) is null), 'nenhuma faltando')
  union all
  select 4, 'Regras de acesso (RLS) ligadas em todas as tabelas públicas',
         not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
         coalesce((select 'sem RLS: ' || string_agg(tablename, ', ') from pg_tables where schemaname = 'public' and not rowsecurity), 'todas com RLS')
  union all
  select 5, 'Análise por IA DESLIGADA no banco',
         (select count(*) = 1 and bool_and(not enabled) from ai_settings),
         (select 'enabled = ' || string_agg(enabled::text, ', ') || ' · modelo ' || string_agg(model, ', ') from ai_settings)
  union all
  select 6, 'Funções internas fechadas para visitantes e usuários logados',
         not exists (select 1 from pg_proc p join service_only s on s.f = p.proname
                     where p.pronamespace = 'public'::regnamespace
                       and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
         coalesce((select 'abertas: ' || string_agg(distinct p.proname, ', ') from pg_proc p join service_only s on s.f = p.proname
                   where p.pronamespace = 'public'::regnamespace
                     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
                  (select count(*) || ' funções conferidas' from pg_proc p join service_only s on s.f = p.proname where p.pronamespace = 'public'::regnamespace))
  union all
  select 7, 'Funções do admin fechadas para visitantes',
         not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace
                       and proname in ('admin_review_athlete', 'admin_review_organization')
                       and has_function_privilege('anon', oid, 'execute')),
         (select count(*) || ' funções conferidas' from pg_proc where pronamespace = 'public'::regnamespace and proname like 'admin_review_%')
  union all
  select 8, 'Fotos em armazenamento privado',
         exists (select 1 from storage.buckets where id = 'athlete-photos' and not public),
         coalesce((select 'public = ' || public::text from storage.buckets where id = 'athlete-photos'), 'bucket não encontrado')
  union all
  select 9, 'Cadastro cria o perfil automaticamente',
         exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass),
         'gatilho on_auth_user_created'
  union all
  select 10, 'Atalho de pagamento do desenvolvimento local ausente',
         to_regprocedure('public.dev_test_simulate_payment(uuid)') is null,
         'dev_test_simulate_payment só existe no banco local'
  union all
  select 11, 'Nenhum pagamento real registrado',
         not exists (select 1 from payments where coalesce(provider, '') <> 'HOMOLOG'),
         (select count(*) || ' pagamento(s) simulado(s)' from payments where provider = 'HOMOLOG')
)
select verificacao, ok, detalhe from checks order by ordem;
