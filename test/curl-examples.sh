#!/usr/bin/env bash
# Demo script for support-email-triage.
# Requires the server running locally (npm run dev) on the port set in .env.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "== Health check =="
curl -sS "$BASE_URL/health"
echo -e "\n"

echo "== Scenario 1: normal billing email =="
curl -sS -X POST "$BASE_URL/api/triage" \
  -H "Content-Type: application/json" \
  -d '{"emailBody":"Hi, I was charged $49.99 twice on my last statement for the same subscription period. Can you please refund the duplicate charge? My account email is jane@example.com."}'
echo -e "\n"

echo "== Scenario 2: urgent bug email =="
curl -sS -X POST "$BASE_URL/api/triage" \
  -H "Content-Type: application/json" \
  -d '{"emailBody":"URGENT: Our production checkout page has been throwing a 500 error for the last 30 minutes and customers cannot complete purchases. We are losing sales every minute this stays broken."}'
echo -e "\n"

echo "== Scenario 3: gibberish input (model still classifies it, likely as 'other') =="
curl -sS -X POST "$BASE_URL/api/triage" \
  -H "Content-Type: application/json" \
  -d '{"emailBody":"asdkj qw98e uhqw9e8 asdkjn qw9e8uh q9w8ehuq9w8e uhq9w8e9q8we asdjkasd"}'
echo -e "\n"

echo "== Scenario 4: bad input, expect 400 =="
curl -sS -i -X POST "$BASE_URL/api/triage" \
  -H "Content-Type: application/json" \
  -d '{"emailBody":""}'
echo -e "\n"

echo "== Scenario 5: forced fallback (run server with an invalid GEMINI_API_KEY to see this) =="
echo "  GEMINI_API_KEY=invalid npm run dev   # in one terminal, then:"
curl -sS -X POST "$BASE_URL/api/triage" \
  -H "Content-Type: application/json" \
  -d '{"emailBody":"Any email body works here, the point is the API call itself fails."}'
echo -e "\n"
