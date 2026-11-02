#!/usr/bin/env bash
# Teste PONTA A PONTA local VitrinePlayer + PitchVision (sem rede externa, sem Neon, sem Vercel, sem GPU paga).
# Uso:
#   PV_REPO=/caminho/api-ia-analise-futebol PV_PYTHON=$PV_REPO/.venv/bin/python \
#   E2E_VIDEO=video.mp4 [E2E_VIDEO_KIND=synthetic|real] [E2E_DETECTOR=colorblob|rfdetr-medium] \
#   db/tests/local/pitchvision-e2e.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
db="$(cd "$here/../.." && pwd)"
: "${PV_REPO:?defina PV_REPO}" "${PV_PYTHON:?defina PV_PYTHON}" "${E2E_VIDEO:?defina E2E_VIDEO}"
bin="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
work="$(mktemp -d)"
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u "${PG_OS_USER:-postgres}" -- "$@"; else "$@"; fi; }
[ "$(id -u)" = 0 ] && chown "${PG_OS_USER:-postgres}" "$work"
mkdir -p "$work/e2e" && chmod 777 "$work/e2e"
trap 'as_pg "$bin/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
port="${PG_PORT:-55441}"
as_pg "$bin/initdb" -D "$work/data" -U postgres -A trust >/dev/null
as_pg "$bin/pg_ctl" -D "$work/data" -o "-p $port -k $work -c listen_addresses=''" -l "$work/log" start >/dev/null
su=(psql -h "$work" -p "$port" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${su[@]}" -c "create database vp" >/dev/null
"${su[@]}" -d vp -f "$here/neon_stub.sql" >/dev/null
"${su[@]}" -c "alter database vp owner to neondb_owner" \
  -c "alter database vp set neon.project_id = 'vp-local'" -c "alter database vp set neon.branch_id = 'local'" >/dev/null
export VP_ENV=local VP_DB_URL="postgresql://neondb_owner@localhost:$port/vp?host=$work" E2E_WORK="$work/e2e"
unset VP_DB_URL_FILE
node "$db/migrar.mjs" aplicar --branch=local --marcar >/dev/null
echo "== migrations aplicadas (inclui 0016); ponta a ponta com vídeo ${E2E_VIDEO_KIND:-synthetic}"
NODE_PATH="$db/node_modules" node "$here/pitchvision-e2e.mjs"
