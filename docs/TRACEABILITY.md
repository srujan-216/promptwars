# Requirements Traceability

Every row names a real file and a real test that passes today. Rows for anything not built
have been deleted rather than left as aspirational entries — see *Not built* at the end,
which records absences as decisions.

Run `pnpm test` to verify every test named here.

## Core requirements

| Req ID | Requirement | Implementation | Test | Status |
| --- | --- | --- | --- | --- |
| CR-1 | Patient Information Intake | `components/medical/IntakeForm.tsx` -> `lib/intake/schema.ts` -> `lib/intake/present.ts` | `marks every intake field as user_provided`, `fires the allergy contradiction when intake claims none but the document names one`, `describes the field with its error message` | Done |
| CR-2 | Medical Report Processing | `components/medical/ReportAnalyzer.tsx` → `app/api/analyze/route.ts` → `lib/server/extraction/pipeline.ts` | `renders the result after a successful submission`, `evaluates status from the genuine printed range` | Done |
| CR-3 | Structured Medical Record | `components/medical/StructuredRecord.tsx`, `lib/domain/types.ts` | `gives every section an accessible name`, `shows the unverifiable field in the quarantine region only` | Done |
| CR-4 | Reference-Range Awareness | `lib/ranges/evaluate.ts` | `treats the lower bound as inclusive`, `returns no_reference_in_source when the range is null`, `returns unit_mismatch and refuses to compare when units differ` (46 tests) | Done |
| CR-5 | Source & Provenance | `lib/verification/audit.ts`, `components/medical/SourceView.tsx`, `components/medical/OriginBadge.tsx`, `components/medical/QuarantineSection.tsx` | `quarantines a field whose quote is absent`, `rejects_prompt_injected_reference_range`, `shows no highlight, because the quote is genuinely absent`, `flips a quarantined field to human-verified` | Done |
| CR-6 | AI-Powered Summary | `components/medical/SummarySection.tsx` ← `app/api/analyze/route.ts` ← `lib/server/ai/summary.ts`, `lib/server/ai/guardrail.ts` | `renders the summary section when the server returns one`, `says visibly when the guardrail fired`, `falls back to the template when both attempts break rules` | Done |

**On the qualified rows.** CR-2 is now genuinely Done: a user can paste a report and the
UI reaches the real pipeline. CR-6 is Done: the guardrailed summary is rendered, badged
`ai_generated`, and a fired guardrail is stated visibly rather than hidden. CR-1 is Done:
identifier, age, sex, symptoms with durations, conditions, allergies, medications and notes
are entered through a validated form, stored `user_provided`, and fed into both conflict
detection and clarification.

All six core requirements now have a UI path that reaches the code behind them.

## Supporting modules

| Module | Purpose | Test | Tests |
| --- | --- | --- | --- |
| `lib/terminology/normalize.ts` | Deterministic analyte aliasing | `every canonical name is itself a stable fixed point` | 40 |
| `lib/conflicts/detect.ts` | Flags contradictions, never resolves them | `flags rather than resolves — it never says which side is correct` | 25 |
| `lib/compare/diff.ts` | Previous vs current report deltas | `describes the number only — direction carries no clinical meaning` | 19 |
| `components/medical/ComparisonTable.tsx` | Renders the comparison; arithmetic framing only | `contains no language framing a change as good or bad` | 14 |
| `components/medical/SummarySection.tsx` | Renders the summary; shows a fired guardrail | `does not badge the deterministic template as AI-written` | 14 |
| `components/medical/ConflictsSection.tsx` | Renders flagged contradictions | `says it flags contradictions rather than resolving them` | (in page tests) |
| `components/medical/QuestionsSection.tsx` | Renders clarification questions | `renders clarification questions` | (in page tests) |
| `components/medical/PrintButton.tsx` + `app/globals.css` | Print-to-PDF via the browser pipeline | `keeps the quarantine section, still separate and still labelled`, `prints the status word, not just a colour` | 15 |
| `components/medical/SourceView.tsx` | Side-by-side source and fields; keyboard-operable highlight | `activates the highlight with Enter`, `says explicitly that there is nothing to highlight` | 19 |
| `lib/view/highlight.ts` | Locates a quote in the source, with the verifier's exact tolerance | `agrees for %j` (highlighting agrees with verification) | 14 |
| `lib/sample/example.ts` | Fixture-backed full result for the no-key path | `passes the real guardrail`, `every quoted sourceQuote that verified is genuinely in the document` | 13 |
| `lib/server/ai/provider.ts` | Gemini wrapper, sha256 cache, one retry | `serves an identical request from cache at zero cost` | 15 |
| `lib/server/extraction/fallback.ts` | Pattern extraction when no API key is set | `produces a verified, evaluated record without any model call` | 10 |
| `components/medical/ReportAnalyzer.tsx` | Paste form, previous-report field, error states, mode disclosure | `says no AI was used when the server reports the pattern fallback`, `sends the previous report to the server` | 21 |
| `lib/intake/schema.ts` | Shared client+server intake validation | `rejects listing an allergy while also claiming none are known` | 21 |
| `components/medical/IntakeForm.tsx` | Accessible intake form | `describes the field with its error message` | 20 |
| `lib/intake/present.ts` | Intake -> Provenanced user_provided fields | `marks every intake field as user_provided` | (in schema tests) |
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
| 11 | README never describes absent features | This file; tests `labels the worked example as synthetic with fixed AI output`, `states that only the model response is recorded`, `says no AI was used when the server reports the pattern fallback`, `passes the real guardrail` | Active |
| 12 | API keys server-side only | `server-only` in `lib/server/**`; `getServerEnv()` never reaches a client bundle | Active |

## Not built

Deliberate absences: file upload (paste only), persistence of any kind, authentication and
access control, generated-PDF export (printing is used instead), and deployment. See the README's *Future work* section. Nothing in this
repository claims otherwise.
