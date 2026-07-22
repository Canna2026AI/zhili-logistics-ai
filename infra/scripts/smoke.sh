#!/bin/sh

set -eu

REPOSITORY_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$REPOSITORY_ROOT"

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

random_suffix=$(node -e "process.stdout.write(require('node:crypto').randomBytes(12).toString('hex'))")
COMPOSE_PROJECT_NAME=zhili-task6-$random_suffix
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-infra/.env.example}
API_IMAGE=zhili-task6-api:$COMPOSE_PROJECT_NAME
WORKER_IMAGE=zhili-task6-worker:$COMPOSE_PROJECT_NAME
POSTGRES_PORT=0
REDIS_PORT=0
MINIO_API_PORT=0
MINIO_CONSOLE_PORT=0
API_PORT=0
EVIDENCE_DIR=${TMPDIR:-/tmp}/${COMPOSE_PROJECT_NAME}-evidence
export COMPOSE_PROJECT_NAME COMPOSE_ENV_FILE API_IMAGE WORKER_IMAGE
export POSTGRES_PORT REDIS_PORT MINIO_API_PORT MINIO_CONSOLE_PORT API_PORT

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
  docker image rm "$API_IMAGE" "$WORKER_IMAGE" >/dev/null 2>&1 || true
  rm -rf "$EVIDENCE_DIR"
}

if [ -n "$(project_resources)" ]; then
  echo "Task 6 preflight failed: generated project identity already has labeled resources." >&2
  exit 1
fi
if docker image inspect "$API_IMAGE" >/dev/null 2>&1 \
  || docker image inspect "$WORKER_IMAGE" >/dev/null 2>&1; then
  echo "Task 6 preflight failed: generated application image identity already exists." >&2
  exit 1
fi

trap cleanup EXIT HUP INT TERM
mkdir -p "$EVIDENCE_DIR"
echo "preflight: collision-safe project and Docker-managed ephemeral ports allocated"

compose config --quiet
compose build --check

if ! CI=true pnpm install --offline --frozen-lockfile --trust-lockfile \
  >"$EVIDENCE_DIR/offline-install.log" 2>&1; then
  echo "Offline pnpm store is incomplete; run 'pnpm fetch --frozen-lockfile' while online." >&2
  exit 1
fi
echo "preflight: frozen offline install passed"

for image in \
  postgres:17-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193 \
  redis:8-alpine@sha256:9d317178eceac8454a2284a9e6df2466b93c745529947f0cd42a0fa9609d7005 \
  minio/minio:RELEASE.2025-04-22T22-12-26Z@sha256:a1ea29fa28355559ef137d71fc570e508a214ec84ff8083e39bc5428980b015e \
  minio/mc:RELEASE.2025-04-16T18-13-26Z@sha256:aead63c77f9db9107f1696fb08ecb0faeda23729cde94b0f663edf4fe09728e3 \
  node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94
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

mapped_port() {
  service=$1
  container_port=$2
  mapping=$(compose port "$service" "$container_port")
  port=${mapping##*:}
  case "$port" in
    ''|*[!0-9]*)
      echo "Task 6 port assertion failed: $service has no ephemeral loopback port." >&2
      exit 1
      ;;
  esac
  echo "$port"
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

  if ! redis_clients=$(compose exec -T redis sh -c \
    'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --no-auth-warning CLIENT LIST'); then
    echo "Task 6 drain assertion failed: Redis client inspection failed." >&2
    exit 1
  fi
  if echo "$redis_clients" | grep 'name=zhili-outbox-' >/dev/null; then
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

  TEST_POSTGRES_PORT=$(mapped_port postgres 5432)
  TEST_REDIS_PORT=$(mapped_port redis 6379)
  TEST_MINIO_API_PORT=$(mapped_port minio 9000)
  TEST_MINIO_CONSOLE_PORT=$(mapped_port minio 9001)
  TEST_API_PORT=$(mapped_port api 3000)
  echo "cycle $cycle: Docker-assigned loopback ports discovered"

  COMPOSE_CYCLE=$cycle \
  TEST_POSTGRES_PORT=$TEST_POSTGRES_PORT \
  TEST_REDIS_PORT=$TEST_REDIS_PORT \
  TEST_MINIO_API_PORT=$TEST_MINIO_API_PORT \
  TEST_MINIO_CONSOLE_PORT=$TEST_MINIO_CONSOLE_PORT \
  TEST_API_PORT=$TEST_API_PORT \
  pnpm exec vitest run tests/integration/compose-smoke.test.ts \
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
