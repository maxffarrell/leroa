#!/usr/bin/env bash
# Route load-time check for Leroa.
#
# Measures server-rendered page TTFB plus the number of SQL statements each
# page (including remote query() calls) issues, so query-count regressions
# show up in review. Times are medians of 3 requests.
#
# Usage:
#   scripts/perf.sh <base-url> <cookie-jar> [docker-pg-container]
#
# Get a session cookie jar first:
#   curl -c /tmp/jar -X POST -H "origin: http://localhost:5173" \
#     http://localhost:5173/demo        # demo workspace (LEROA_DEMO server)
# or sign in:
#   curl -c /tmp/jar -H "origin: <base>" -H 'content-type: application/json' \
#     -d '{"email":"you@x.com","password":"..."}' <base>/api/auth/sign-in/email
#
# Query counting needs postgres statement logging on the container:
#   docker exec pg psql -U leroa -d keystone \
#     -c "ALTER SYSTEM SET log_min_duration_statement = 0" \
#     -c "SELECT pg_reload_conf()"
set -euo pipefail

BASE=${1:?usage: scripts/perf.sh <base-url> <cookie-jar> [container]}
JAR=${2:?cookie jar path}
PG=${3:-pg}

ROUTES=(
  /dashboard /properties /tenants /rent /leases /leasing /maintenance
  /vendors /messages /documents /reports /inspections /residents
  /settings /settings/audit-log
)

printf '%-28s %8s %8s\n' route ms queries
for path in "${ROUTES[@]}"; do
  curl -sf -b "$JAR" -o /dev/null "$BASE$path" || { echo "$path -> request failed"; continue; }
  since=$(date -u +%FT%T.%NZ)
  times=()
  for _ in 1 2 3; do
    times+=("$(curl -sf -b "$JAR" -o /dev/null -w '%{time_total}' "$BASE$path")")
  done
  IFS=$'\n' sorted=($(sort -n <<<"${times[*]}")); unset IFS
  ms=$(awk "BEGIN{ printf \"%d\", ${sorted[1]} * 1000 }")
  q=$(docker logs "$PG" --since "$since" 2>&1 | grep -c 'execute' || true)
  printf '%-28s %8s %8s\n' "$path" "$ms" "$q"
done
