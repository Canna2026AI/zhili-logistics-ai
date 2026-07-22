#!/bin/sh

set -eu

REPOSITORY_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$REPOSITORY_ROOT"

COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-zhili-task6-$$}
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-infra/.env.example}
EVIDENCE_DIR=${TMPDIR:-/tmp}/${COMPOSE_PROJECT_NAME}-evidence
export COMPOSE_PROJECT_NAME COMPOSE_ENV_FILE

compose() {
  docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$COMPOSE_ENV_FILE" -f infra/compose.yaml "$@"
}

project_resources() {
  docker ps -aq --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME"
  docker network ls -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME"
  docker volume ls -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME"
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$EVIDENCE_DIR"
}

trap cleanup EXIT HUP INT TERM
mkdir -p "$EVIDENCE_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Task 6 preflight failed: required command '$1' is unavailable." >&2
    exit 1
  fi
}

for command_name in node corepack pnpm docker; do
  require_command "$command_name"
done

if ! docker compose version >/dev/null 2>&1; then
  echo "Task 6 preflight failed: Docker Compose v2 is unavailable." >&2
  exit 1
fi

if ! docker info --format '{{.OSType}}' 2>/dev/null | grep '^linux$' >/dev/null; then
  echo "Task 6 preflight failed: a responsive Docker Desktop Linux engine is required." >&2
  exit 1
fi

ports=$(node -e '
  const net = require("node:net");
  const servers = Array.from({ length: 5 }, () => net.createServer());
  Promise.all(servers.map((server) => new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  }))).then(() => {
    console.log(servers.map((server) => server.address().port).join(" "));
    return Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  }).catch(() => process.exit(1));
')
set -- $ports
if [ "$#" -ne 5 ]; then
  echo "Task 6 preflight failed: unable to allocate isolated loopback ports." >&2
  exit 1
fi
POSTGRES_PORT=$1
REDIS_PORT=$2
MINIO_API_PORT=$3
MINIO_CONSOLE_PORT=$4
API_PORT=$5
export POSTGRES_PORT REDIS_PORT MINIO_API_PORT MINIO_CONSOLE_PORT API_PORT
echo "preflight: isolated loopback ports allocated"

compose config --quiet
compose build --check

if ! CI=true pnpm install --offline --frozen-lockfile --trust-lockfile \
  >"$EVIDENCE_DIR/offline-install.log" 2>&1; then
  echo "Offline pnpm store is incomplete; run 'pnpm fetch --frozen-lockfile' while online." >&2
  exit 1
fi
echo "preflight: frozen offline install passed"

for image in \
  postgres:17-alpine \
  redis:8-alpine \
  minio/minio:RELEASE.2025-04-22T22-12-26Z \
  minio/mc:RELEASE.2025-04-16T18-13-26Z \
  node:22.22.0-bookworm-slim
do
  docker pull "$image" >/dev/null
  docker image inspect --format '{{index .RepoDigests 0}} architecture={{.Architecture}}' "$image"
done

BUILDKIT_NO_CLIENT_TOKEN=1 DOCKER_BUILD_NETWORK=default \
  compose build --pull --progress plain api worker \
  >"$EVIDENCE_DIR/initial-build.log" 2>&1
echo "preflight: application images built with network=default"

assert_no_project_resources() {
  resources=$(project_resources)
  if [ -n "$resources" ]; then
    echo "Task 6 cleanup assertion failed: project resources remain." >&2
    exit 1
  fi
}

container_id() {
  compose ps --all --quiet "$1"
}

assert_service_health() {
  service=$1
  id=$(container_id "$service")
  if [ -z "$id" ]; then
    echo "Task 6 health assertion failed: $service container is absent." >&2
    exit 1
  fi
  state=$(docker inspect --format '{{.State.Status}}' "$id")
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id")
  if [ "$state" != running ] || [ "$health" != healthy ]; then
    echo "Task 6 health assertion failed: $service state=$state health=$health." >&2
    exit 1
  fi
}

assert_one_shot_success() {
  service=$1
  id=$(container_id "$service")
  if [ -z "$id" ]; then
    echo "Task 6 one-shot assertion failed: $service container is absent." >&2
    exit 1
  fi
  state=$(docker inspect --format '{{.State.Status}}' "$id")
  code=$(docker inspect --format '{{.State.ExitCode}}' "$id")
  if [ "$state" != exited ] || [ "$code" -ne 0 ]; then
    echo "Task 6 one-shot assertion failed: $service state=$state exit=$code." >&2
    exit 1
  fi
}

wait_for_stopped() {
  deadline=$(( $(date +%s) + 30 ))
  while :; do
    api_running=$(docker inspect --format '{{.State.Running}}' "$API_CONTAINER_ID")
    worker_running=$(docker inspect --format '{{.State.Running}}' "$WORKER_CONTAINER_ID")
    if [ "$api_running" = false ] && [ "$worker_running" = false ]; then
      return 0
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "Task 6 graceful-stop assertion failed: api/worker did not stop within 30 seconds." >&2
      return 1
    fi
    sleep 1
  done
}

assert_drained() {
  lease_count=$(compose exec -T postgres sh -c \
    'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM outbox_events WHERE lease_owner IS NOT NULL AND lease_expires_at > now()"')
  if [ "$lease_count" -ne 0 ]; then
    echo "Task 6 drain assertion failed: live worker lease remains." >&2
    exit 1
  fi

  db_client_count=$(compose exec -T postgres sh -c \
    'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE '\''zhili-outbox-%'\'' OR application_name = '\''zhili-health-readiness'\''"')
  if [ "$db_client_count" -ne 0 ]; then
    echo "Task 6 drain assertion failed: owned PostgreSQL clients remain." >&2
    exit 1
  fi

  if compose exec -T redis sh -c \
    'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli --no-auth-warning CLIENT LIST' \
    | grep 'name=zhili-outbox-' >/dev/null; then
    echo "Task 6 drain assertion failed: owned Redis clients remain." >&2
    exit 1
  fi
}

run_cycle() {
  cycle=$1
  echo "cycle $cycle: cleanup/start"
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  assert_no_project_resources
  echo "cycle $cycle: zero project resources before start"

  if [ "$cycle" -eq 2 ]; then
    BUILDKIT_NO_CLIENT_TOKEN=1 DOCKER_BUILD_NETWORK=none \
      compose build --progress plain api worker \
      >"$EVIDENCE_DIR/cycle-2-offline-build.log" 2>&1
    if ! grep 'pnpm fetch --frozen-lockfile' "$EVIDENCE_DIR/cycle-2-offline-build.log" >/dev/null \
      || ! grep 'pnpm install --offline --frozen-lockfile' "$EVIDENCE_DIR/cycle-2-offline-build.log" >/dev/null \
      || ! grep 'CACHED' "$EVIDENCE_DIR/cycle-2-offline-build.log" >/dev/null; then
      echo "Task 6 cycle 2 failed: frozen dependency layers were not proven cached." >&2
      exit 1
    fi
    echo "cycle 2: network=none build reused frozen cached dependency layers"
  fi

  compose up --detach --no-build --pull never --wait --wait-timeout 180
  for service in postgres redis minio api worker; do
    assert_service_health "$service"
  done
  assert_one_shot_success migrate
  assert_one_shot_success minio-init
  echo "cycle $cycle: all services healthy and one-shots succeeded"

  COMPOSE_CYCLE=$cycle pnpm exec vitest run tests/integration/compose-smoke.test.ts \
    --no-file-parallelism --testTimeout=120000 --hookTimeout=120000
  echo "cycle $cycle: real smoke assertions passed"

  API_CONTAINER_ID=$(container_id api)
  WORKER_CONTAINER_ID=$(container_id worker)
  compose kill -s SIGTERM api worker >/dev/null
  echo "cycle $cycle: SIGTERM sent"
  wait_for_stopped

  for id in "$API_CONTAINER_ID" "$WORKER_CONTAINER_ID"; do
    oom=$(docker inspect --format '{{.State.OOMKilled}}' "$id")
    if [ "$oom" != false ]; then
      echo "Task 6 graceful-stop assertion failed: a service was OOM-killed." >&2
      exit 1
    fi
  done
  assert_drained
  echo "cycle $cycle: api/worker stopped gracefully and resources drained"

  compose down --volumes --remove-orphans >/dev/null
  assert_no_project_resources
  echo "cycle $cycle: zero project resources after down"
}

run_cycle 1
run_cycle 2

echo "Task 6 Compose smoke passed: two empty-volume cycles completed."
