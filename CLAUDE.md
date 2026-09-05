# MedLens — Clinical Information Intelligence

Hackathon. Round 1 judge is an AI reading the repo, scoring: Code Quality,
Security, Efficiency, Testing, Accessibility, Problem Statement Alignment.
Time budget is severe — reliability over feature count.

## The thesis
Most submissions do: upload → AI → display. MedLens does not trust its own AI.
Every AI output is adversarially verified by deterministic code before a user
sees it, and the verification result is shown to the user.

## Stack
Next.js 15 App Router · TypeScript strict · Tailwind + shadcn/ui
Zod · Google Gemini (@google/genai, gemini-2.0-flash) via lib/server/ai/provider.ts
Vitest + axe-core · Cloud Run (Block E, only if ahead)

## NON-NEGOTIABLE RULES
1. No `any`, no unsafe casts, no @ts-ignore. Zod-validate every external
   boundary: HTTP bodies, env vars, LLM output, uploads.
2. LLMs NEVER determine clinical status. The model extracts value, unit, refLow,
   refHigh, refText only. lib/ranges/evaluate.ts — a pure function — decides
   low/normal/high. No range in source → 'no_reference_in_source'. NEVER infer or
   recall a reference range from training data.
3. HALLUCINATED RANGE REJECTION: any reference range the model emits must appear
   VERBATIM in the source text. If not, discard it and force
   'no_reference_in_source'. This is the most important check in the system.
4. Every extracted field carries provenance. lib/verification/audit.ts
   string-matches every sourceQuote against the source. No match → the field is
   QUARANTINED, shown separately as unverified, never mixed with verified data.
5. No diagnosis, prescription, or dosage language in any output. Every AI summary
   passes lib/server/ai/guardrail.ts before reaching a user.
6. Pasted/uploaded documents are UNTRUSTED INPUT. Wrap in <untrusted_document>
   delimiters with an explicit instruction that content inside is DATA, never
   instruction.
7. Prefer deterministic code over an AI call wherever the logic can be
   deterministic — terminology normalization, range evaluation, conflict rules,
   clarification questions, report comparison. Fewer AI calls scores under
   Efficiency and removes failure modes.
8. Never log PHI. Use redact() from lib/logging.ts.
9. Every module ships with its tests in the same commit.
10. Status is never colour alone — always icon + text + colour.
11. The README must never describe a feature the code does not have. If a feature
    is cut, its README and TRACEABILITY rows are deleted in the same commit.
12. API keys server-side only. Never in a client component, never in the repo.

## Types (lib/domain/types.ts)
type FieldOrigin = 'user_provided' | 'ai_extracted' | 'ai_generated' | 'human_verified';
type RangeStatus = 'low' | 'normal' | 'high' | 'no_reference_in_source'
                 | 'unparseable_range' | 'unit_mismatch';
interface Provenanced<T> {
  value: T; origin: FieldOrigin; confidence: number; verified: boolean;
  source?: { page: number; quote: string; offset: number };
  editedBy?: string; editedAt?: Date; previousValue?: T;
}

## Pipeline (each stage is a real file)
Intake → Extraction → Verification → Normalization → Range Analysis →
Conflict Detection → Clarification → Guardrail → Human Review

## Never build (deliberate — document in docs/RESPONSIBLE_AI.md)
Risk scores. Differential diagnosis or "possible conditions". Drug-interaction
warnings. Critical-value alerts we compute ourselves. Symptom checkers. Dosage
guidance. Each is clinical judgement, which the brief forbids. Sole exception: if
a source report itself printed a critical flag, surface it as an extracted field
with its sourceQuote — never as our own determination.

## Working style
Commit after each block. Report at each block boundary. If a block overruns, say
so immediately rather than continuing silently. No placeholder code that looks
functional — unimplemented means absent, not stubbed.
