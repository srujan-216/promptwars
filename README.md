# MedLens — Clinical Information Intelligence

Most AI medical tools ask you to trust the model. MedLens verifies it. Every extracted
field is matched against its source text. Every reference range is checked for verbatim
presence in the document — hallucinated ranges are rejected, not displayed. Clinical
status is computed by a pure function, never by the model.

> **Scope boundary.** MedLens never diagnoses, prescribes, or recommends treatment.

## Status

**Scaffold only.** The type/lint/test harness, environment validation and a health check
endpoint are in place. No clinical features are implemented yet — no extraction, no
range evaluation, no summary. [`docs/TRACEABILITY.md`](docs/TRACEABILITY.md) is the
authoritative status list, and it is deliberately mostly "Not started".

## Stack

Next.js 15 (App Router) · TypeScript (strict) · Tailwind v4 · Radix primitives ·
Zod · Vitest + Testing Library + axe-core · Google Gemini

## Getting started

Requires Node ≥ 22 and pnpm 9.15.0.

```bash
pnpm install
cp .env.example .env.local
pnpm dev                     # http://localhost:3000
```

No API key is needed to build, lint, test, or run the scaffold. `GEMINI_API_KEY` is
required only once AI features exist; it is validated lazily so CI stays green without
it, and absent means the AI path throws rather than falling back to a placeholder.

Health check:

```bash
curl http://localhost:3000/api/health
```

Returns `commit: null` locally — the real commit SHA appears only when `GIT_SHA` is set
at build time. It is never faked.

## Scripts

| Script            | What it does                                   |
| ----------------- | ---------------------------------------------- |
| `pnpm dev`        | Dev server                                     |
| `pnpm build`      | Production build                               |
| `pnpm start`      | Serve the production build                     |
| `pnpm typecheck`  | `tsc --noEmit`                                 |
| `pnpm lint`       | ESLint (typescript-eslint + jsx-a11y + Next)   |
| `pnpm format`     | Prettier write                                 |
| `pnpm test`       | Vitest, run once                               |
| `pnpm test:watch` | Vitest, watch mode                             |
| **`pnpm verify`** | **typecheck → lint → test → build. The gate.** |

`pnpm verify` is the definition of done. CI runs exactly these stages.

## Conventions

- No `any`, no `as unknown as`, no `@ts-ignore`. ESLint fails the build on the first two.
- Every external boundary is Zod-validated. `lib/env.ts` is the first example.
- Tests are colocated: `env.ts` → `env.test.ts`.
- Server-only code lives in `lib/server/` and is blocked from client imports by a
  `no-restricted-imports` rule.
- Secrets are validated lazily and never logged.

## Known gaps

- `color-contrast` is **not** verified by the automated a11y tests. axe-core needs a real
  canvas to sample pixels, which jsdom does not provide, so the rule is explicitly
  disabled in `components/ui/button.test.tsx`. Contrast is a manual check.
- a11y coverage is component-level only; no full-page or browser-based scan.

## Future work — NOT built

Nothing in this section exists in the repository.

- **Persistence.** Storage is an in-memory `Map` behind a documented
  `PatientRecordStore` interface, so swapping in a database is a one-file change. No
  database, no migrations, and no persistence across restarts exist today.
- **Deployment.** Nothing is deployed. There is no Dockerfile, no deployment pipeline,
  and no running service.
- **Browser-based and end-to-end a11y testing**, which would close the `color-contrast`
  and full-page gaps above.
