#!/bin/sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMEOUT=30
BASE_URL="http://localhost:3000"

passed=0
failed=0
active_project=""
active_compose=""

cleanup() {
    if [ -n "$active_project" ] && [ -n "$active_compose" ]; then
        docker compose -p "$active_project" -f "$active_compose" down -v --timeout 5 >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT INT TERM

teardown() {
    docker compose -p "$active_project" -f "$active_compose" down -v --timeout 5 >/dev/null 2>&1
    active_project=""
    active_compose=""
}

build_image() {
    label="$1"
    shift
    printf "\n  BUILD %s\n" "$label"
    build_log=$(mktemp)
    if ! ./image.sh create "$@" >"$build_log" 2>&1; then
        cat "$build_log"
        printf "  FAIL  %s (image build failed)\n" "$label"
        rm -f "$build_log"
        exit 1
    fi
    rm -f "$build_log"
}

assert_status() {
    expected="$1"
    path="$2"
    shift 2
    status=$(curl -s -m 5 -o /dev/null -w "%{http_code}" "$BASE_URL$path" "$@" || true)
    if [ "$status" != "$expected" ]; then
        printf "    FAIL  expected %s, got %s → %s %s\n" "$expected" "$status" "$path" "$*"
        return 1
    fi
    printf "    OK    %s → %s %s\n" "$expected" "$path" "$*"
    return 0
}

assert_body() {
    needle="$1"
    path="$2"
    shift 2
    body=$(curl -s -m 5 "$BASE_URL$path" "$@" || true)
    if ! printf "%s" "$body" | grep -q -- "$needle"; then
        printf "    FAIL  expected '%s' in the body of %s\n" "$needle" "$path"
        return 1
    fi
    printf "    OK    '%s' in %s\n" "$needle" "$path"
    return 0
}

run_scenario() {
    name="$1"
    compose_file="$2"
    verify_fn="$3"
    project="notas-test-${name}"
    active_project="$project"
    active_compose="$compose_file"

    printf "\n  TEST  %s\n" "$name"

    docker compose -p "$project" -f "$compose_file" up -d --wait-timeout "$TIMEOUT" 2>/dev/null

    elapsed=0
    while [ "$elapsed" -lt "$TIMEOUT" ]; do
        logs=$(docker compose -p "$project" -f "$compose_file" logs notas 2>&1)

        if printf "%s" "$logs" | grep -q "Notas started"; then
            printf "%s\n" "$logs"

            if $verify_fn; then
                printf "  PASS  %s\n" "$name"
                passed=$((passed + 1))
            else
                printf "  FAIL  %s (verification failed)\n" "$name"
                failed=$((failed + 1))
            fi

            teardown
            return 0
        fi

        if ! docker compose -p "$project" -f "$compose_file" ps --status running 2>/dev/null | grep -q notas; then
            printf "%s\n" "$logs"
            printf "  FAIL  %s (container exited)\n" "$name"
            failed=$((failed + 1))
            teardown
            return 1
        fi

        sleep 1
        elapsed=$((elapsed + 1))
    done

    docker compose -p "$project" -f "$compose_file" logs notas 2>&1
    printf "  FAIL  %s (timeout after %ds)\n" "$name" "$TIMEOUT"
    failed=$((failed + 1))
    teardown
    return 1
}

# a handshake, as a plain GET only gets the public html shell; a 101 holds curl until its timeout
assert_upgrade() {
    expected="$1"
    shift
    assert_status "$expected" /socket "$@" \
        -H "Connection: Upgrade" -H "Upgrade: websocket" \
        -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw=="
}

# the user's writes prove the root-owned volume is usable by the unprivileged user
verify_login() {
    jar=$(mktemp)
    json="content-type: application/json"
    assert_status "200" /health \
    && assert_status "200" /api/env \
    && assert_status "401" /api/workspaces \
    && assert_status "200" /api/session -X POST -H "$json" -d '{"username":"admin","password":"admin"}' -c "$jar" \
    && assert_status "200" /api/users -X POST -H "$json" -d '{"username":"kim","password":"kim-password"}' -b "$jar" \
    && assert_status "200" /api/session -X POST -H "$json" -d '{"username":"kim","password":"kim-password"}' -c "$jar" \
    && workspace=$(curl -s -b "$jar" "$BASE_URL/api/workspaces" | grep -o '"id":"[^"]*"' | head -n 1 | cut -d '"' -f 4) \
    && assert_status "200" "/api/workspaces/$workspace/pages" -X POST -H "$json" -d '{"title":"Deployment test"}' -b "$jar" \
    && assert_body '"title":"Deployment test"' "/api/workspaces/$workspace/pages" -b "$jar" \
    && assert_status "200" "/api/workspaces/$workspace/media?filename=test.txt" -X POST -H "content-type: text/plain" --data-binary "deployment" -b "$jar" \
    && assert_status "200" /api/workspaces -u kim:kim-password \
    && assert_status "401" /api/workspaces -u kim:wrong \
    && assert_status "200" /emojibase/en/data.json \
    && assert_status "200" /favicon.svg \
    && assert_upgrade "401" \
    && assert_upgrade "101" -b "$jar" \
    && assert_status "404" /api/restricted/purge -X POST
    result=$?
    rm -f "$jar"
    return $result
}

verify_admin_password_required() {
    printf "\n  TEST  admin-password-required\n"
    output=$(docker run --rm butterhosting/notas:latest 2>&1 || true)
    if printf "%s" "$output" | grep -q "NOTAS_ADMIN_PASSWORD"; then
        printf "    OK    refuses to start without NOTAS_ADMIN_PASSWORD\n  PASS  admin-password-required\n"
        passed=$((passed + 1))
    else
        printf "%s\n  FAIL  admin-password-required (it started, or failed for another reason)\n" "$output"
        failed=$((failed + 1))
    fi
}

cd "$ROOT"

build_image "default"
run_scenario "login" "$SCRIPT_DIR/compose.yaml" verify_login
verify_admin_password_required

printf "\n  %d passed, %d failed\n\n" "$passed" "$failed"
[ "$failed" -eq 0 ]
