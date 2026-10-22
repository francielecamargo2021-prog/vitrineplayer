/**
 * Consultas do limitador (funções auth_* de 0013/0014), com placeholders $1, $2.
 * Compartilhadas entre o app (rate-limit.ts, driver do Neon) e o teste de simultaneidade
 * (db/tests/local/simultaneidade.mjs, driver pg), para os dois rodarem exatamente o mesmo SQL.
 */
export const LIMIT_SQL = {
  consume: "select auth_limit_consume($1::jsonb) as r",
  refund: "select auth_limit_refund($1::text[])",
  clear: "select auth_limit_clear($1::text[])",
  guardBegin: "select auth_guard_begin($1, $2) as r",
  guardSuccess: "select auth_guard_success($1)",
  deviceCheck: "select auth_device_check($1, $2) as r",
  deviceRegister: "select auth_device_register($1, $2, $3)",
  deviceRevokeAll: "select auth_device_revoke_all($1)",
  sendCooldown: "select auth_send_cooldown($1) as r",
} as const;
