-- Reversão da migration 0014_protecao_conta.sql (NÃO é aplicada automaticamente).
-- Desfaz só o que a 0014 criou; as regras e tabelas de 0013 continuam intactas.
-- Uso (somente com autorização): psql/console do Neon no branch certo, numa transação.
-- Depois, o app precisa voltar ao commit anterior à E2 (as funções abaixo deixam de existir).
begin;
drop function if exists auth_limit_consume(jsonb);
drop function if exists auth_limit_refund(text[]);
drop function if exists auth_guard_begin(text, boolean);
drop function if exists auth_guard_success(text);
drop function if exists auth_device_check(text, text);
drop function if exists auth_device_register(text, text, int);
drop function if exists auth_device_revoke_all(text);
drop function if exists auth_send_cooldown(text);
drop table if exists auth_send_cooldown;
drop table if exists auth_devices;
drop table if exists auth_account_guard;
-- remove o registro para o migrar.mjs não acusar migração "aplicada e ausente"
delete from vp_meta.migrations where arquivo = '0014_protecao_conta.sql';
commit;
