# support-email-triage

**Live demo:** https://email-triage-service.onrender.com ([health check](https://email-triage-service.onrender.com/health)) — hosted on Render's free tier, so the first request after a period of inactivity can take ~30-60 seconds to wake up.

A single-endpoint REST API that classifies inbound customer support emails — request type, urgency, team, and a two-sentence summary — using Gemini. Built as a portfolio piece to demonstrate how to wrap an LLM call in a production-safe API: strict input validation, defensive response parsing, and a fallback path that guarantees the endpoint never breaks a caller, even when the model or the network does.

## What it does

`POST /api/triage` takes a raw support email body and returns a structured classification:

```json
{
  "requestType": "billing",
  "urgency": "medium",
  "summary": "The customer was charged twice for their subscription this month. They are requesting a refund for the duplicate charge.",
  "team": "payments",
  "fallbackUsed": false
}
```

This is the shape of thing a real support queue would route on: which team, how urgent, one-line context — without a human reading every inbound email first.

## Why the validation + fallback design matters

If this endpoint fed a real ticket queue, a bad response isn't just an inconvenience — it's a ticket that gets silently dropped, misrouted to the wrong team, or a 500 that takes the intake pipeline down with it. LLMs are not reliable JSON emitters: they occasionally wrap output in markdown fences, add a stray sentence, invent an enum value that isn't in the schema, or the API call itself can time out or hit an auth error. None of that is rare enough to ignore in production.

So this service treats the model as an unreliable dependency, not a trusted function call:

1. **Prompt discipline** — the system prompt demands raw JSON only, with three few-shot examples anchoring the exact shape expected.
2. **Defensive parsing** — the raw response is stripped of markdown code fences (if present) before `JSON.parse`, inside a `try/catch`.
3. **Schema validation** — the parsed object is checked against a Zod schema with exact enum matching. A model that invents `"urgency": "urgent"` instead of `"high"` fails validation, not silently passes through.
4. **One retry** — if parsing or validation fails, the model is called exactly once more, in case the first response was a fluke.
5. **Guaranteed fallback, not an error** — if the second attempt also fails, or the Gemini API is unreachable (network error, invalid key, timeout), the endpoint returns a safe, fixed payload with `fallbackUsed: true` and **HTTP 200**, not a 500. The raw model output is logged server-side for debugging. A downstream queue consumer can always route on `fallbackUsed` to flag the ticket for manual review — the pipeline never stalls waiting on a response that will never come in the right shape.

The result: the caller's contract is always satisfied. Every response is schema-valid JSON with a real HTTP 200. Failure shows up as data (`fallbackUsed: true`), not as an exception the caller has to special-case.

## Stack

- Node.js + Express + TypeScript (strict mode)
- Zod for request and model-output validation
- `@google/genai`, model: `gemini-3.6-flash`
- No database — fully stateless, one request in, one response out

## Project structure

```
src/
  index.ts             server bootstrap, /health
  config.ts            env loading (GEMINI_API_KEY, PORT)
  routes/triage.ts      POST /api/triage — input validation, calls the classifier
  services/classifier.ts  prompt, Gemini call, parsing, retry, fallback
  schemas/triage.ts     Zod schemas + inferred types for request and response
```

## Running locally

```bash
npm install
cp .env.example .env
# edit .env and set GEMINI_API_KEY (get one free at https://aistudio.google.com/apikey)

npm run dev     # tsx watch, http://localhost:3000
```

Build and run compiled output:

```bash
npm run build    # tsc -> dist/
npm start
```

## Try it

The examples below use `http://localhost:3000` for a local run — swap in `https://email-triage-service.onrender.com` to hit the live demo instead (note the first request may be slow while the free-tier instance wakes up).

With the server running, either run the bundled demo script:

```bash
./test/curl-examples.sh
```

or use the individual commands below.

**Normal billing email:**

```bash
curl -X POST http://localhost:3000/api/triage \
  -H "Content-Type: application/json" \
  -d '{"emailBody":"Hi, I was charged $49.99 twice on my last statement for the same subscription period. Can you please refund the duplicate charge?"}'
```

```json
{
  "requestType": "billing",
  "urgency": "medium",
  "summary": "The customer was charged twice for their subscription this month. They are requesting a refund for the duplicate charge.",
  "team": "payments",
  "fallbackUsed": false
}
```

**Urgent bug email:**

```bash
curl -X POST http://localhost:3000/api/triage \
  -H "Content-Type: application/json" \
  -d '{"emailBody":"URGENT: Our production checkout page has been throwing a 500 error for the last 30 minutes and customers cannot complete purchases."}'
```

```json
{
  "requestType": "bug",
  "urgency": "high",
  "summary": "The customer'\''s production checkout page has been returning a 500 error for the past 30 minutes. Customers are unable to complete purchases during this outage.",
  "team": "engineering",
  "fallbackUsed": false
}
```

**Gibberish input:**

```bash
curl -X POST http://localhost:3000/api/triage \
  -H "Content-Type: application/json" \
  -d '{"emailBody":"asdkj qw98e uhqw9e8 asdkjn qw9e8uh q9w8ehuq9w8e"}'
```

Gemini is generally well-behaved enough to still return valid JSON for nonsense input (classifying it as `"other"` / low urgency) — this case mainly demonstrates the model doesn't choke on off-distribution input, not the fallback path itself.

**To actually see the fallback fire**, force an API failure — e.g. run with a bad key:

```bash
GEMINI_API_KEY=invalid npm run dev
```

```bash
curl -X POST http://localhost:3000/api/triage \
  -H "Content-Type: application/json" \
  -d '{"emailBody":"Any body text — the point is the Gemini call itself fails."}'
```

```json
{
  "requestType": "other",
  "urgency": "medium",
  "summary": "Automatic classification failed; needs manual review.",
  "team": "general_support",
  "fallbackUsed": true
}
```

Still `HTTP 200`.

**Invalid request (empty body):**

```bash
curl -i -X POST http://localhost:3000/api/triage \
  -H "Content-Type: application/json" \
  -d '{"emailBody":""}'
```

```
HTTP/1.1 400 Bad Request
{"error":"emailBody must not be empty"}
```

## Deploying to Render

1. Push this repo to GitHub.
2. In [Render](https://render.com), click **New → Web Service**, and connect this GitHub repo.
3. Runtime: **Node**. Build command: `npm install && npm run build`. Start command: `npm start`.
4. Add an environment variable: `GEMINI_API_KEY` (required). Render sets `PORT` automatically and the app reads it via `process.env.PORT`, so no need to set it manually.
5. Choose the **Free** instance type and deploy.
6. Once deployed, health-check at `https://<your-app>.onrender.com/health`.

Note: Render's free tier spins the service down after a period of inactivity, so the first request after idling can take ~30-60 seconds while it wakes up.
