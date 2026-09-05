import 'server-only';

import {
  buildDeterministicSummary,
  checkGuardrail,
  type GuardrailResult,
  type TemplateInput,
} from '@/lib/server/ai/guardrail';
import type { Provider } from '@/lib/server/ai/provider';
import type { SummarySource } from '@/lib/domain/types';

/**
 * Summary generation with a guaranteed-safe floor (CLAUDE.md rule 5).
 *
 * Three tiers, in order:
 *   1. Generate a summary and check it.
 *   2. If it fails, regenerate ONCE with a stricter instruction naming what broke.
 *   3. If that fails too, fall back to the deterministic template.
 *
 * The fallback is what makes this safe to ship. It is built from counts by pure code and
 * makes no clinical claim, so it cannot fail the guardrail. There is no path here that
 * shows a user text which has not passed `checkGuardrail`.
 */

export const SUMMARY_SYSTEM_INSTRUCTION = `You summarise what a medical document printed. You never interpret it.

You may state: which measurements appear, their values and units, whether the report itself printed a reference range, and whether a value sits outside the range PRINTED ON THAT REPORT.

You must never: diagnose, name a condition, say the reader "has" anything, suggest treatment, mention medication or dosage, advise changing treatment, or offer reassurance such as "nothing to worry about".

Write plainly, in at most four sentences. End by suggesting the reader discuss the results with a qualified clinician.`;

const STRICTER_PREFIX = `Your previous summary was rejected for containing language that is not permitted. Do not diagnose, do not name conditions, do not mention medication, dosage or treatment, and do not offer reassurance. State only what the document printed.`;

export interface SummaryResult {
  text: string;
  source: SummarySource;
  /** True when any generated attempt was rejected. Surfaced in the integrity panel. */
  guardrailTriggered: boolean;
  /** What was wrong with each rejected attempt, in order. */
  rejectedAttempts: GuardrailResult[];
  aiCalls: number;
}

export interface GenerateSummaryInput {
  provider: Provider;
  /** Factual, already-verified counts. This is all the model is given. */
  facts: TemplateInput;
  /** Plain description of the verified results, built by deterministic code. */
  factsNarrative: string;
}

// Uppercase for the same reason as the extraction schema: Gemini's Schema type, not JSON
// Schema. This one had the same defect and would have failed identically once reached.
const summaryGeminiSchema = {
  type: 'OBJECT',
  properties: { summary: { type: 'STRING' } },
  required: ['summary'],
} as const;

function readSummary(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const record: Record<string, unknown> = { ...data };
  const summary = record['summary'];
  return typeof summary === 'string' && summary.trim() !== '' ? summary : null;
}

export async function generateSummary(input: GenerateSummaryInput): Promise<SummaryResult> {
  const { provider, facts, factsNarrative } = input;
  const rejectedAttempts: GuardrailResult[] = [];
  let aiCalls = 0;

  async function attempt(systemInstruction: string): Promise<string | null> {
    try {
      const result = await provider.generate({
        systemInstruction,
        prompt: factsNarrative,
        responseSchema: summaryGeminiSchema,
      });
      aiCalls += result.callCount;
      return readSummary(result.data);
    } catch {
      // A provider failure is not a reason to show nothing — the template still applies.
      return null;
    }
  }

  // Tier 1
  const first = await attempt(SUMMARY_SYSTEM_INSTRUCTION);
  if (first !== null) {
    const check = checkGuardrail(first);
    if (check.passed) {
      return {
        text: first,
        source: 'generated',
        guardrailTriggered: false,
        rejectedAttempts: [],
        aiCalls,
      };
    }
    rejectedAttempts.push(check);
  }

  // Tier 2 — one stricter retry, naming the failure.
  const second = await attempt(`${STRICTER_PREFIX}\n\n${SUMMARY_SYSTEM_INSTRUCTION}`);
  if (second !== null) {
    const check = checkGuardrail(second);
    if (check.passed) {
      return {
        text: second,
        source: 'regenerated',
        guardrailTriggered: true,
        rejectedAttempts,
        aiCalls,
      };
    }
    rejectedAttempts.push(check);
  }

  // Tier 3 — deterministic floor. Cannot fail, because it makes no clinical claim.
  return {
    text: buildDeterministicSummary(facts),
    source: 'deterministic_template',
    guardrailTriggered: true,
    rejectedAttempts,
    aiCalls,
  };
}
