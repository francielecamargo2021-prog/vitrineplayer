#!/usr/bin/env bash
# Roda migrations + testes de banco em um PostgreSQL local temporário (sem Docker).
# Uso: supabase/tests/local/run.sh            (requer binários do PostgreSQL 15+)
# No Supabase real, use: npx supabase test db
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
bin="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$bin/initdb" ] || { echo "PostgreSQL não encontrado (defina PG_BIN)"; exit 1; }
work="$(mktemp -d)"
# initdb não roda como root: usa o usuário "postgres" quando necessário.
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u "${PG_OS_USER:-postgres}" -- "$@"; else "$@"; fi; }
[ "$(id -u)" = 0 ] && chown "${PG_OS_USER:-postgres}" "$work"
trap 'as_pg "$bin/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
port="${PG_PORT:-55439}"
as_pg "$bin/initdb" -D "$work/data" -U postgres -A trust >/dev/null
as_pg "$bin/pg_ctl" -D "$work/data" -o "-p $port -k $work -c listen_addresses=''" -l "$work/log" start >/dev/null
psql=(psql -h "$work" -p "$port" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${psql[@]}" -c "create database vp" >/dev/null
run() { "${psql[@]}" -d vp "$@"; }
run -f "$here/supabase_stub.sql" >/dev/null
for m in "$root"/supabase/migrations/*.sql; do
  echo "migration: $(basename "$m")"
  run --single-transaction -f "$m" >/dev/null
done
run -f "$here/pgtap_shim.sql" >/dev/null
status=0
for t in "$root"/supabase/tests/*.test.sql; do
  # a extensão pgtap é substituída pelo shim local
  out="$(sed '/create extension if not exists pgtap/d' "$t" | run 2>&1)" && rc=0 || rc=$?
  total="$(grep -cE "NOTICE:  (not )?ok [0-9]+" <<<"$out" || true)"
  failed="$(grep -E "NOTICE:  not ok|ERROR" <<<"$out" || true)"
  if [ "$rc" -ne 0 ] || [ -n "$failed" ]; then
    status=1; echo "✗ $(basename "$t") ($total asserções)"; echo "$out" | grep -E "not ok|#   |ERROR" | sed 's/^NOTICE:  /   /'
  else
    echo "✓ $(basename "$t") ($total asserções)"
  fi
done
exit $status
