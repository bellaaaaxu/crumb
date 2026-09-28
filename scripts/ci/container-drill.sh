#!/usr/bin/env bash
# The deployment and recovery drill from docs/DEPLOYMENT.md and docs/OPERATIONS.md,
# run for real on a machine with Docker (CI is set up to run it on every pull request).
# It uses its own project name, image tag and throwaway volumes, and ignores the
# folder's .env — but it needs port 3000, so run it on a CI machine or a spare
# computer, not on the server that runs your Crumb.
#
#   bash scripts/ci/container-drill.sh
#
# Build, first start, one-time setup through the API, a reward, restart,
# backup inside the running container, restore into a new volume and switch
# to it, owner recovery from the command line, and rollback to the original.
set -euo pipefail

export COMPOSE_PROJECT_NAME=crumb-drill
export COMPOSE_FILE=compose.yaml
export CRUMB_IMAGE=crumb:drill
export CRUMB_DATA_VOLUME=crumb_drill_data
export CRUMB_BACKUP_VOLUME=crumb_drill_backups
export PUBLIC_ORIGIN=http://localhost:3000
export ALLOW_LOCAL_HTTP=true
RESTORED=crumb_drill_restored
ORIGIN=http://localhost:3000
PASSWORD='drill-owner-password-1'
NEW_PASSWORD='drill-owner-password-2'
work=$(mktemp -d)
jar="$work/cookies"
csrf=''

cleanup() {
  local status=$?
  if [ "$status" -ne 0 ]; then docker compose logs --no-color crumb || true; fi
  docker compose down --remove-orphans >/dev/null 2>&1 || true
  docker volume rm "$CRUMB_DATA_VOLUME" "$CRUMB_BACKUP_VOLUME" "$RESTORED" >/dev/null 2>&1 || true
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT

group() { echo "::group::$*"; }
endgroup() { echo "::endgroup::"; }
fail() { echo "DRILL FAILED: $*" >&2; exit 1; }
expect() { [ "$1" = "$2" ] || fail "$3: expected $2, got $1 ($(cat "$work/body" 2>/dev/null))"; }

# api METHOD PATH [JSON] [IDEMPOTENCY-KEY] -> prints the HTTP status; the body is in $work/body
api() {
  local method=$1 path=$2 data=${3:-} key=${4:-}
  local args=(-sS -o "$work/body" -w '%{http_code}' -b "$jar" -c "$jar" -X "$method" "$ORIGIN$path")
  if [ "$method" != GET ]; then args+=(-H "Origin: $ORIGIN" -H "X-CSRF-Token: $csrf"); fi
  if [ -n "$data" ]; then args+=(-H 'Content-Type: application/json' --data "$data"); fi
  if [ -n "$key" ]; then args+=(-H "Idempotency-Key: $key"); fi
  curl "${args[@]}" || true
}
body() { cat "$work/body"; }
fresh_session() { csrf=$(curl -fsS -b "$jar" -c "$jar" "$ORIGIN/api/session" | jq -r .csrfToken); }
sign_in() {
  fresh_session
  expect "$(api POST /api/login "$(jq -n --arg p "$1" '{username:"owner", password:$p}')")" 200 "$2"
  csrf=$(body | jq -r .csrfToken)
}
wait_healthy() {
  for _ in $(seq 1 90); do
    if curl -fsS "$ORIGIN/healthz" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  fail "Crumb did not become healthy"
}

group "Secrets and Compose configuration"
node scripts/init-secrets.mjs
# No chown: the file stays owned by this runner's user (not uid 1000), exactly as
# on a server where the deploy user's id is not 1000. Setup below proves the
# container can still read it.
[ "$(stat -c %a .secrets)" = 700 ] || fail ".secrets must be closed to other users"
docker compose config --quiet
PUBLIC_ORIGIN=https://crumb.example.com SITE_ADDRESS=crumb.example.com \
  docker compose -f compose.yaml -f compose.https.yaml config --quiet
endgroup

group "Build and first start"
docker compose up -d --build --wait --wait-timeout 180
curl -fsS "$ORIGIN/healthz"; echo
expect "$(docker compose exec -T crumb id -u)" 1000 "container user id"
docker compose exec -T crumb sh -c 'test ! -e /app/tests && test ! -e /app/.git && test ! -e /app/.env && test ! -e /app/.secrets && test ! -e /app/docs' \
  || fail "the image contains files it should not"
endgroup

group "One-time setup through the API"
fresh_session
token=$(cat .secrets/setup-token)
setup=$(jq -n --arg t "$token" --arg p "$PASSWORD" '{setupToken:$t, username:"owner", password:$p,
  displayName:"Drill Owner", org:{name:"Drill Team", mode:"points", unitLabel:"points", threshold:"100", locale:"en"}}')
expect "$(api POST /api/setup "$setup")" 201 "first setup"
csrf=$(body | jq -r .csrfToken)
owner_id=$(body | jq -r .user.id)
expect "$(api POST /api/setup "$setup")" 409 "second setup"
grant=$(jq -n --arg u "$owner_id" '{userId:$u, amount:"150", mode:"points", reason:"Drill"}')
expect "$(api POST /api/admin/grants "$grant" drill-grant-request-0001)" 201 "grant"
expect "$(api POST /api/admin/grants "$grant" drill-grant-request-0001)" 201 "retried grant"
endgroup

group "Restart keeps data and sessions"
docker compose restart crumb
wait_healthy
expect "$(api GET /api/me)" 200 "still signed in after restart"
expect "$(body | jq .balance.postedUnits)" 150 "balance after restart (the retry did not add another 150)"
expect "$(body | jq '.collection | length')" 1 "collection after restart"
endgroup

group "Backup inside the running container"
docker compose exec -T crumb node scripts/backup.mjs --output /backups/drill.sqlite
expect "$(api GET /api/me)" 200 "the app kept serving during the backup"
endgroup

group "Restore into a new volume and switch to it"
docker compose stop crumb
docker volume create "$RESTORED" >/dev/null
docker run --rm -v "$RESTORED:/data" -v "$CRUMB_BACKUP_VOLUME:/backups:ro" "$CRUMB_IMAGE" \
  node scripts/restore.mjs --from /backups/drill.sqlite --to /data/crumb.sqlite
CRUMB_DATA_VOLUME=$RESTORED docker compose up -d --wait --wait-timeout 180
expect "$(api GET /api/me)" 401 "an old session on the restored copy"
sign_in "$PASSWORD" "sign in on the restored copy"
expect "$(api GET /api/me)" 200 "restored account"
expect "$(body | jq .balance.postedUnits)" 150 "restored balance"
expect "$(body | jq '.collection | length')" 1 "restored collection"
endgroup

group "Owner recovery from the command line"
printf '%s\n' "$NEW_PASSWORD" | CRUMB_DATA_VOLUME=$RESTORED docker compose exec -T crumb node scripts/recover-owner.mjs --username owner
expect "$(api GET /api/me)" 401 "sessions end after recovery"
sign_in "$NEW_PASSWORD" "sign in with the recovered password"
endgroup

group "Roll back to the original volume"
docker compose stop crumb
docker compose up -d --wait --wait-timeout 180
sign_in "$PASSWORD" "the original password on the original volume"
expect "$(api GET /api/me)" 200 "original data"
expect "$(body | jq .balance.postedUnits)" 150 "original balance"
endgroup

echo "Drill passed."
