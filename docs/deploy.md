# Deployment

**Target: Vercel.** Next.js 15 App Router deploys natively — no Dockerfile, and no
`output: 'standalone'`, which is why `next.config.ts` does not set it.

> **Status: not yet deployed.** No live URL exists at the time of writing. This file is the
> runbook, not a record of something that has happened. The README will carry the live URL
> only once a deployment is up and confirmed — see rule 11.

## Not containerized

There is **no Dockerfile in this repository** and no container image. Cloud Run was the
original target in an early plan and was cut; nothing was built for it. If you read a claim
anywhere that this project is "also containerized", that claim is wrong and should be
deleted rather than fixed by adding a Dockerfile after the fact.

Adding one later is straightforward — Next supports `output: 'standalone'` for exactly this
— but until it exists, this document does not pretend otherwise.

## Commands

Run these yourself; they are not run for you.

```bash
npx vercel login
npx vercel link
npx vercel env add GEMINI_API_KEY production
npx vercel --prod
```

`vercel env add` prompts for the value on stdin. The key is stored in Vercel's encrypted
environment store, scoped to Production, and never enters the repository or the build output.

## Environment variables

| Variable | Scope | Required | Notes |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Production (server) | For AI features | Without it the app still builds and runs; extraction falls back to pattern matching and says so. |
| `APP_ENV` | Production | No | Defaults to `local`. Set to `production` if you want it reflected in `/api/health`. |
| `GIT_SHA` | Production | No | Vercel exposes `VERCEL_GIT_COMMIT_SHA`; map it if you want `/api/health` to report a real commit. |

**Never prefix the key with `NEXT_PUBLIC_`.** That prefix inlines a value into the client
bundle, which would publish the key to every visitor.

## Why the key cannot leak

Four independent mechanisms, listed so a reviewer can check each:

1. **`server-only`** — every module under `lib/server/` imports it. Pulling one into a client
   bundle is a build error.
2. **ESLint boundary** — `no-restricted-imports` blocks `@/lib/server/*` from `components/`.
3. **Lazy validation** — the key is read through `getServerEnv()` in `lib/env.ts`, called only
   from server code, and never at import time.
4. **A test** — [`lib/server/ai/keyExposure.test.ts`](../lib/server/ai/keyExposure.test.ts)
   walks `app/`, `components/` and `lib/` and asserts there is no `NEXT_PUBLIC_` anywhere, no
   `process.env` read in any `'use client'` file, no key read outside server code, and no
   committed key-shaped literal. It runs in CI.

## Runtime configuration

`app/api/analyze/route.ts` declares:

- `export const runtime = 'nodejs'` — the provider uses `node:crypto` for its cache key, which
  the Edge runtime does not provide. Declaring it explicitly means a change of default would
  fail at build rather than at request time.
- `export const maxDuration = 60` — Vercel's default for serverless functions is 10s. A Gemini
  extraction, a second extraction when a previous report is supplied, and a summary call can
  exceed that. 60s is the free-tier ceiling and is a safety margin, not an expectation.
- `export const dynamic = 'force-dynamic'` — the route must never be cached.

## After deploying

Check, in order:

```bash
curl https://<your-deployment>/api/health
```

Expect `200` and `{"status":"ok",...}`.

Then open the site and paste a report. With the key set, the mode notice **"No AI was used
for this result"** should be absent — its presence means the key is not reaching the
function, and Vercel needs a redeploy after `env add`.

Only once that is confirmed should the live URL be added to the README.
