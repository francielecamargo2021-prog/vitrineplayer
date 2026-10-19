#!/usr/bin/env bash
# Gera supabase/homolog/passos/NN_<migration>.sql a partir de supabase/migrations/.
# Cada passo = trava de ambiente + migration original (sem alteração) + registro.
# Uso: scripts/homolog/gerar-passos.sh          (gera)
#      scripts/homolog/gerar-passos.sh --check  (falha se os passos estiverem desatualizados)
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
out="$root/supabase/homolog/passos"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
prev=""
n=0
for m in "$root"/supabase/migrations/*.sql; do
  n=$((n + 1))
  file="$(basename "$m" .sql)"          # ex.: 0001_init
  version="${file%%_*}"                 # ex.: 0001
  name="${file#*_}"                     # ex.: init
  step="$(printf '%02d' "$n")"
  dest="$tmp/${step}_migration_${file}.sql"
  {
    echo "-- ============================================================================="
    echo "-- PASSO $step — migration $file"
    echo "-- Gerado por scripts/homolog/gerar-passos.sh a partir de supabase/migrations/$file.sql."
    echo "-- NÃO EDITAR À MÃO. Colar inteiro no SQL Editor do projeto vitrineplayer-homolog e clicar em Run."
    echo "-- É uma única transação: se qualquer linha falhar, nada é gravado."
    echo "-- ============================================================================="
    echo "do \$vp\$"
    echo "begin"
    echo "  if not exists (select 1 from pg_namespace where nspname = 'vp_meta') then"
    echo "    raise exception 'VITRINEPLAYER: projeto não marcado como homologação (rode o passo 00). Nada foi alterado.';"
    echo "  end if;"
    echo "  if not exists (select 1 from vp_meta.environment where name = 'homolog') then"
    echo "    raise exception 'VITRINEPLAYER: este projeto não é o de homologação. Nada foi alterado.';"
    echo "  end if;"
    echo "  if exists (select 1 from supabase_migrations.schema_migrations where version = '$version') then"
    echo "    raise exception 'VITRINEPLAYER: migration $file já aplicada. Nada foi alterado.';"
    echo "  end if;"
    if [ -n "$prev" ]; then
      echo "  if not exists (select 1 from supabase_migrations.schema_migrations where version = '$prev') then"
      echo "    raise exception 'VITRINEPLAYER: aplique antes a migration $prev. Nada foi alterado.';"
      echo "  end if;"
    fi
    echo "end \$vp\$;"
    echo
    echo "-- ---------------------------------------------------------------- início da migration original"
    cat "$m"
    echo
    echo "-- ---------------------------------------------------------------- fim da migration original"
    echo "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$name');"
    echo "select 'OK: migration $file aplicada' as resultado;"
  } > "$dest"
  prev="$version"
done
if [ "${1:-}" = "--check" ]; then
  for f in "$tmp"/*.sql; do
    cmp -s "$f" "$out/$(basename "$f")" || { echo "desatualizado: $(basename "$f") (rode scripts/homolog/gerar-passos.sh)"; exit 1; }
  done
  echo "passos de migration atualizados"
else
  rm -f "$out"/[0-9][0-9]_migration_*.sql
  cp "$tmp"/*.sql "$out/"
  ls "$out"
fi
