# Requirements Traceability

Status vocabulary: **Not started** · **In progress** · **Done**.

A row is **Done** only when the implementation exists *and* the named test exists and
passes. This table never describes a feature the code does not have. Rows for features
that are not being built have been deleted rather than left as aspirational entries.

> This file is rewritten at the end of the build, when every row can name a real file
> path and a real test. Right now it records the true state: infrastructure is in place,
> the clinical requirements are not yet implemented.

## Core requirements

| Req ID | Requirement                | Implementation (file path) | Tests (test name) | Status      |
| ------ | -------------------------- | -------------------------- | ----------------- | ----------- |
| CR-1   | Patient Information Intake | —                          | —                 | Not started |
| CR-2   | Medical Report Processing  | —                          | —                 | Not started |
| CR-3   | Structured Medical Record  | —                          | —                 | Not started |
| CR-4   | Reference-Range Awareness  | —                          | —                 | Not started |
| CR-5   | Source & Provenance        | —                          | —                 | Not started |
| CR-6   | AI-Powered Summary         | —                          | —                 | Not started |

## Infrastructure

| ID    | Item                            | Implementation                  | Test                                         | Status |
| ----- | ------------------------------- | ------------------------------- | -------------------------------------------- | ------ |
| INF-1 | Health check endpoint           | `app/api/health/route.ts`       | `GET /api/health`                            | Done   |
| INF-2 | Zod-validated environment       | `lib/env.ts`                    | `parseEnv`, `parseServerEnv`                 | Done   |
| INF-3 | Strict TypeScript               | `tsconfig.json`                 | `pnpm typecheck`                             | Done   |
| INF-4 | Lint + a11y lint                | `eslint.config.mjs`             | `pnpm lint`                                  | Done   |
| INF-5 | Test harness                    | `vitest.config.ts`              | `pnpm test`                                  | Done   |
| INF-6 | Component a11y assertions (axe) | `components/ui/button.test.tsx` | `has no axe violations across every variant` | Done   |
| INF-7 | CI pipeline                     | `.github/workflows/ci.yml`      | typecheck → lint → test → build              | Done   |

## Not being built

Recorded so their absence is a decision, not an oversight: authentication and RBAC,
Postgres persistence, cryptographic audit chains, FHIR or LOINC coding, TOTP,
multi-language support, and any form of deployment. Storage is an in-memory Map behind
an interface (see README Future work).

## Honest gaps

- `color-contrast` is not verified automatically: axe-core needs a real canvas to sample
  pixels, which jsdom does not provide, so the rule is explicitly disabled in
  `components/ui/button.test.tsx`. Contrast is a manual check.
- a11y coverage is component-level only; there is no browser-based or full-page scan.
- Nothing is deployed.
