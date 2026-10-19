#!/usr/bin/env bash
# Ensaio local do procedimento de homologação (PostgreSQL temporário, sem rede).
# Simula o SQL Editor do Supabase: cada arquivo roda numa única transação.
# Confere também as travas: projeto errado, ordem errada e aplicação repetida.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
bin="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$bin/initdb" ] || { echo "PostgreSQL não encontrado (defina PG_BIN)"; exit 1; }
work="$(mktemp -d)"
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u "${PG_OS_USER:-postgres}" -- "$@"; else "$@"; fi; }
[ "$(id -u)" = 0 ] && chown "${PG_OS_USER:-postgres}" "$work"
trap 'as_pg "$bin/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
port="${PG_PORT:-55440}"
as_pg "$bin/initdb" -D "$work/data" -U postgres -A trust >/dev/null
as_pg "$bin/pg_ctl" -D "$work/data" -o "-p $port -k $work -c listen_addresses=''" -l "$work/log" start >/dev/null
psql=(psql -h "$work" -p "$port" -U postgres -v ON_ERROR_STOP=1 -q -X -t -A)
fails=0
pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; fails=$((fails + 1)); }
# roda um arquivo como o SQL Editor (1 transação); $1 = banco, $2 = arquivo, demais = substituições sed
apply() { local db="$1" f="$2"; shift 2; local sql; sql="$(cat "$f")"; for s in "$@"; do sql="$(sed "$s" <<<"$sql")"; done; "${psql[@]}" -d "$db" --single-transaction <<<"$sql" 2>&1; }
expect_ok() { local desc="$1"; shift; if out="$(apply "$@")"; then pass "$desc"; else fail "$desc"; echo "$out" | sed 's/^/    /'; fi; }
expect_err() { local desc="$1" pattern="$2"; shift 2; if out="$(apply "$@")"; then fail "$desc (deveria ter recusado)"; elif grep -q "$pattern" <<<"$out"; then pass "$desc"; else fail "$desc"; echo "$out" | sed 's/^/    /'; fi; }
q() { "${psql[@]}" -d "$1" -c "$2"; }

steps="$here/passos"
for db in homolog outro; do "${psql[@]}" -c "create database $db" >/dev/null; done
# "homolog" imita um projeto Supabase novo; "outro" imita um projeto que já tem um sistema
"${psql[@]}" -d homolog -f "$root/supabase/tests/local/supabase_stub.sql" >/dev/null

echo "— travas antes da marcação"
expect_err "passo 01 recusa projeto sem marca" "não marcado" homolog "$steps/01_migration_0001_init.sql"
q outro "create table public.sistema_existente (id int)" >/dev/null
expect_err "passo 00 recusa projeto que já tem tabelas" "não é um projeto novo" outro "$steps/00_marcar_homologacao.sql"

echo "— marcação"
expect_ok "passo 00 marca o projeto vazio" homolog "$steps/00_marcar_homologacao.sql"
expect_err "passo 00 não roda duas vezes" "já está marcado" homolog "$steps/00_marcar_homologacao.sql"
expect_err "passo 02 recusa sem o passo 01" "aplique antes a migration 0001" homolog "$steps/02_migration_0002_guardian_panel.sql"

echo "— migrations"
for f in "$steps"/[0-9][0-9]_migration_*.sql; do expect_ok "$(basename "$f")" homolog "$f"; done
expect_err "migration repetida é recusada sem alterar nada" "já aplicada" homolog "$steps/03_migration_0003_international_profile.sql"

echo "— dados de teste e utilidades"
expect_ok "dados de teste" homolog "$here/dados-teste.sql"
expect_ok "dados de teste de novo (não duplica)" homolog "$here/dados-teste.sql"
[ "$(q homolog "select count(*) from organizations where name like '[TESTE]%'")" = 6 ] && pass "6 organizações [TESTE]" || fail "6 organizações [TESTE]"

q homolog "insert into auth.users (id, email, raw_user_meta_data) values ('a0000000-0000-0000-0000-00000000000a', 'responsavel@teste.dev', '{\"full_name\":\"[TESTE] Responsável\",\"country\":\"BR\"}')" >/dev/null
expect_err "tornar-admin recusa e-mail não trocado" "troque SEU_EMAIL_AQUI" homolog "$here/tornar-admin.sql"
expect_err "tornar-admin recusa conta inexistente" "nenhuma conta" homolog "$here/tornar-admin.sql" "s/SEU_EMAIL_AQUI/ninguem@teste.dev/"
expect_ok "tornar-admin promove a conta" homolog "$here/tornar-admin.sql" "s/SEU_EMAIL_AQUI/responsavel@teste.dev/"
[ "$(q homolog "select role from profiles where email = 'responsavel@teste.dev'")" = ADMIN ] && pass "conta virou ADMIN" || fail "conta virou ADMIN"

q homolog "insert into auth.users (id, email, raw_user_meta_data) values ('b0000000-0000-0000-0000-00000000000b', 'familia@teste.dev', '{\"full_name\":\"[TESTE] Família\",\"country\":\"BR\"}')" >/dev/null
q homolog "select set_config('request.jwt.claims', '{\"sub\":\"b0000000-0000-0000-0000-00000000000b\",\"role\":\"authenticated\"}', false); set role authenticated; select create_athlete('[TESTE] Atleta Fictício', 'Fictício', '2011-04-02', 'BR'); update athletes set status = 'pending_payment';" >/dev/null
expect_err "simular-pagamento recusa nome não trocado" "encontrei 0" homolog "$here/simular-pagamento.sql"
expect_ok "simular-pagamento confirma o pagamento" homolog "$here/simular-pagamento.sql" "s/NOME_ESPORTIVO_AQUI/Fictício/"
[ "$(q homolog "select status from athletes where sport_name = 'Fictício'")" = in_review ] && pass "atleta foi para revisão" || fail "atleta foi para revisão"
expect_err "simular-pagamento não paga duas vezes" "encontrei 0" homolog "$here/simular-pagamento.sql" "s/NOME_ESPORTIVO_AQUI/Fictício/"

echo "— verificação"
out="$(apply homolog "$here/verificar.sql")"
echo "$out" | sed 's/^/    /'
if grep -q "|f|" <<<"$out" || [ "$(grep -c "|t|" <<<"$out")" -ne 11 ]; then fail "verificar.sql: todas as 11 conferências ok"; else pass "verificar.sql: todas as 11 conferências ok"; fi

"$root/scripts/homolog/gerar-passos.sh" --check >/dev/null && pass "passos idênticos às migrations atuais" || fail "passos idênticos às migrations atuais"
echo
[ "$fails" = 0 ] && echo "Ensaio completo sem falhas." || { echo "$fails falha(s)."; exit 1; }
