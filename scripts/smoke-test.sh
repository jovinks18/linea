#!/usr/bin/env bash
set -u

BASE_URL="${BASE_URL:-http://localhost:3000}"
FAILURES=0

post_intake() {
  local email="$1"
  local message="$2"

  curl -s "${BASE_URL}/api/intake" \
    -H "Content-Type: application/json" \
    -d "{\"channel\":\"web_chat\",\"customer_email\":\"${email}\",\"message\":\"${message}\"}"
}

expect_contains() {
  local label="$1"
  local response="$2"
  local expected="$3"

  if printf '%s' "$response" | grep -Fq "$expected"; then
    printf 'PASS: %s contains %s\n' "$label" "$expected"
  else
    printf 'FAIL: %s missing %s\n' "$label" "$expected"
    printf 'Response: %s\n' "$response"
    FAILURES=$((FAILURES + 1))
  fi
}

printf 'Running Linea smoke tests against %s\n' "$BASE_URL"

SMART_LOCK_RESPONSE="$(post_intake \
  "maya.chen@example.com" \
  "My smart lock is not responding after I changed the batteries.")"

expect_contains "smart lock failure" "$SMART_LOCK_RESPONSE" '"sentiment":"negative"'
expect_contains "smart lock failure" "$SMART_LOCK_RESPONSE" '"priority":"P1"'
expect_contains "smart lock failure" "$SMART_LOCK_RESPONSE" '"name":"Acme Clinics"'
expect_contains "smart lock failure" "$SMART_LOCK_RESPONSE" '"plan":"Growth"'

BLOCKER_RESPONSE="$(post_intake \
  "maya.chen@example.com" \
  "Our API setup is still blocked and we are supposed to go live Friday.")"

expect_contains "api go-live blocker" "$BLOCKER_RESPONSE" '"onboarding_blocker_detected":true'
expect_contains "api go-live blocker" "$BLOCKER_RESPONSE" '"task_created":true'
expect_contains "api go-live blocker" "$BLOCKER_RESPONSE" '"product_signal_created":true'
expect_contains "api go-live blocker" "$BLOCKER_RESPONSE" '"health_event_created":true'
expect_contains "api go-live blocker" "$BLOCKER_RESPONSE" '"account_health_updated":true'

UNKNOWN_BLOCKER_RESPONSE="$(post_intake \
  "unknown.blocker@example.com" \
  "Our API setup is still blocked and we are supposed to go live Friday.")"

expect_contains "unknown account blocker" "$UNKNOWN_BLOCKER_RESPONSE" '"account":null'
expect_contains "unknown account blocker" "$UNKNOWN_BLOCKER_RESPONSE" '"onboarding_blocker_detected":false'

if [ "$FAILURES" -gt 0 ]; then
  printf 'Smoke tests failed: %s failure(s)\n' "$FAILURES"
  exit 1
fi

printf 'Smoke tests passed.\n'
