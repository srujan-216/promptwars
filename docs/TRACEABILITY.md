# Requirements Traceability

Every row names a real file and a real test that passes today. Rows for anything not built
have been deleted rather than left as aspirational entries — see *Not built* at the end,
which records absences as decisions.

Run `pnpm test` to verify every test named here.

## Core requirements

| Req ID | Requirement | Implementation | Test | Status |
| --- | --- | --- | --- | --- |
| CR-1 | Patient Information Intake | `lib/clarify/questions.ts`, `components/medical/StructuredRecord.tsx` (Patient information section) | `asks for age when absent`, `asks for sex when absent` | Partial — report text only, no structured patient form |
| CR-2 | Medical Report Processing | `components/medical/ReportAnalyzer.tsx` → `app/api/analyze/route.ts` → `lib/server/extraction/pipeline.ts` | `renders the result after a successful submission`, `evaluates status from the genuine printed range` | Done |
| CR-3 | Structured Medical Record | `components/medical/StructuredRecord.tsx`, `lib/domain/types.ts` | `gives every section an accessible name`, `shows the unverifiable field in the quarantine region only` | Done |
| CR-4 | Reference-Range Awareness | `lib/ranges/evaluate.ts` | `treats the lower bound as inclusive`, `returns no_reference_in_source when the range is null`, `returns unit_mismatch and refuses to compare when units differ` (46 tests) | Done |
| CR-5 | Source & Provenance | `lib/verification/audit.ts`, `components/medical/OriginBadge.tsx`, `components/medical/QuarantineSection.tsx` | `quarantines a field whose quote is absent`, `rejects_prompt_injected_reference_range`, `flips a quarantined field to human-verified` | Done |
| CR-6 | AI-Powered Summary | `lib/server/ai/summary.ts`, `lib/server/ai/guardrail.ts` | `returns generated text when it passes the guardrail`, `falls back to the template when both attempts break rules` | Partial — generated and guardrailed, but not rendered |

**On the qualified rows.** CR-2 is now genuinely Done: a user can paste a report and the
UI reaches the real pipeline. CR-1 stays Partial because only report text can be submitted
— there is no form for age, sex, symptoms or medications, so intake is inferred from the
document rather than entered. CR-6 stays Partial because the summary is generated and
guardrailed but no component displays it. Marking either Done would overstate what a user
can actually do.

## Supporting modules

| Module | Purpose | Test | Tests |
| --- | --- | --- | --- |
| `lib/terminology/normalize.ts` | Deterministic analyte aliasing | `every canonical name is itself a stable fixed point` | 40 |
| `lib/conflicts/detect.ts` | Flags contradictions, never resolves them | `flags rather than resolves — it never says which side is correct` | 25 |
| `lib/compare/diff.ts` | Previous vs current report deltas | `describes the number only — direction carries no clinical meaning` | 19 |
| `lib/server/ai/provider.ts` | Gemini wrapper, sha256 cache, one retry | `serves an identical request from cache at zero cost` | 15 |
| `lib/server/extraction/fallback.ts` | Pattern extraction when no API key is set | `produces a verified, evaluated record without any model call` | 10 |
| `components/medical/ReportAnalyzer.tsx` | Paste form, error states, mode disclosure | `says no AI was used when the server reports the pattern fallback` | 17 |
| `lib/env.ts` | Zod-validated environment | `never echoes the key value in the error message` | 10 |

## Engineering invariants

What enforces each rule from `CLAUDE.md`. "Enforced by" means a tool fails the build.

| # | Invariant | Enforced by | Status |
| --- | --- | --- | --- |
| 1 | No `any`, no unsafe casts, no `@ts-ignore`; Zod at every boundary | `@typescript-eslint/no-explicit-any` and `ban-ts-comment` as `error`; `lib/env.ts`, `lib/server/extraction/schema.ts` | Active |
| 2 | LLMs never determine clinical status | `lib/ranges/evaluate.ts` is the only producer of low/normal/high; the extraction schema has no field a judgement could arrive in | Active |
| 3 | Hallucinated range rejection, incl. positional adjacency | `rangeAppearsNearQuote` in `lib/verification/audit.ts`; test `rejects_prompt_injected_reference_range` | Active |
| 4 | Provenance on every field; unmatched → quarantined | `auditExtraction`; test `shows the unverifiable field in the quarantine region only` | Active |
| 5 | No diagnosis, prescription or dosage language | `lib/server/ai/guardrail.ts`; test `the fallback text itself passes the guardrail` | Active |
| 6 | Documents are untrusted input | `<untrusted_document>` delimiters and sentinel neutralisation in `lib/server/extraction/prompt.ts` | Active |
| 7 | Prefer deterministic code over an AI call | 6 of 7 pipeline stages are pure; test `makes exactly one AI call and six deterministic stages` | Active |
| 8 | Never log PHI | Nothing logs. `redact()` does not exist — see `docs/SECURITY.md` | Partial |
| 9 | Tests ship with their module | Convention; CI runs `pnpm test` | Active |
| 10 | Status never by colour alone | `components/medical/StatusBadge.tsx` emits icon + text + colour; test `communicates status with text, not colour alone` | Active |
| 11 | README never describes absent features | This file; tests `labels the worked example as synthetic with fixed AI output`, `says no AI call was made for the worked example`, `says no AI was used when the server reports the pattern fallback` | Active |
| 12 | API keys server-side only | `server-only` in `lib/server/**`; `getServerEnv()` never reaches a client bundle | Active |

## Not built

Deliberate absences: file upload (paste only), persistence of any kind, authentication and
access control, PDF export, deployment, a structured intake form, a rendered AI summary,
and a UI for report comparison. See the README's *Future work* section. Nothing in this
repository claims otherwise.
