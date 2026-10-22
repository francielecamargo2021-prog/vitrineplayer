#!/usr/bin/env bash
# Testes do banco num PostgreSQL local temporário que imita o Neon (sem Docker,
# sem rede). Usa o MESMO migrar.mjs e os MESMOS testes que rodam no Neon.
# Uso: db/tests/local/run.sh        (requer binários do PostgreSQL 15+ e `npm install` em db/)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
db="$(cd "$here/../.." && pwd)"
bin="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$bin/initdb" ] || { echo "PostgreSQL não encontrado (defina PG_BIN)"; exit 1; }
work="$(mktemp -d)"
# initdb não roda como root: usa o usuário "postgres" quando necessário.
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u "${PG_OS_USER:-postgres}" -- "$@"; else "$@"; fi; }
[ "$(id -u)" = 0 ] && chown "${PG_OS_USER:-postgres}" "$work"
trap 'as_pg "$bin/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
port="${PG_PORT:-55440}"
as_pg "$bin/initdb" -D "$work/data" -U postgres -A trust >/dev/null
as_pg "$bin/pg_ctl" -D "$work/data" -o "-p $port -k $work -c listen_addresses=''" -l "$work/log" start >/dev/null
su=(psql -h "$work" -p "$port" -U postgres -v ON_ERROR_STOP=1 -q -X)
owner=(psql -h "$work" -p "$port" -U neondb_owner -d vp -v ON_ERROR_STOP=1 -q -X)

"${su[@]}" -c "create database vp" >/dev/null
"${su[@]}" -d vp -f "$here/neon_stub.sql" >/dev/null
"${su[@]}" -c "alter database vp owner to neondb_owner" \
  -c "alter database vp set neon.project_id = 'vp-local'" -c "alter database vp set neon.branch_id = 'local'" >/dev/null

export VP_ENV=local VP_DB_URL="postgresql://neondb_owner@localhost:$port/vp?host=$work"
unset VP_DB_URL_FILE
echo "== migrar.mjs (banco vazio → marca + migrations)"
node "$db/migrar.mjs" aplicar --branch=local --marcar
node "$db/migrar.mjs" verificar

status=0
run_tests() {
  "${owner[@]}" -f "$here/pgtap_shim.sql" >/dev/null
  for t in "$db"/tests/*.test.sql; do
    # a extensão pgtap é substituída pelo shim local
    out="$(sed '/create extension if not exists pgtap/d' "$t" | "${owner[@]}" 2>&1)" && rc=0 || rc=$?
    total="$(grep -cE "NOTICE:  (not )?ok [0-9]+" <<<"$out" || true)"
    failed="$(grep -E "NOTICE:  not ok|ERROR" <<<"$out" || true)"
    if [ "$rc" -ne 0 ] || [ -n "$failed" ]; then
      status=1; echo "✗ $(basename "$t") ($total asserções)"; echo "$out" | grep -E "not ok|#   |ERROR" | sed 's/^NOTICE:  /   /'
    else
      echo "✓ $(basename "$t") ($total asserções)"
    fi
  done
  left="$("${owner[@]}" -At -c "select (select count(*) from neon_auth.\"user\") || ' usuários, ' || (select count(*) from athletes) || ' atletas'")"
  echo "   dados que sobraram: $left"
}
echo "== testes de banco (pgTAP local)"
run_tests

echo "== pedidos simultâneos (50 por cenário)"
node "$here/simultaneidade.mjs" || status=1

echo "== scripts de reversão"
node "$here/testar-reversoes.mjs" || status=1

echo "== travas do migrar.mjs"
node "$db/tests/testar-travas.mjs" || status=1

echo "== testes de banco depois de recriar"
run_tests
exit $status
