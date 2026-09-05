import { describe, expect, it } from 'vitest';

import { createProvider } from '@/lib/server/ai/provider';
import { createPatternFallbackClient } from '@/lib/server/extraction/fallback';
import { runExtractionPipeline } from '@/lib/server/extraction/pipeline';
import { intakeForPipeline } from './present';
import { EMPTY_INTAKE, type Intake } from './schema';

/**
 * Intake reaching the deterministic rules.
 *
 * The allergy-contradiction rule in lib/conflicts/detect.ts has been tested since Block A
 * but could never fire in the running app, because nothing supplied user intake. These
 * tests exercise it through the real pipeline.
 */

const REPORT = `CITY DIAGNOSTIC LABORATORY
Report Date: 2026-08-14
Hemoglobin        11.2 g/dL     13.0 - 17.0 g/dL
Allergies         Penicillin
`;

function intake(overrides: Partial<Intake> = {}): Intake {
  return { ...EMPTY_INTAKE, ...overrides };
}

async function run(value: Intake) {
  const provider = createProvider({ client: createPatternFallbackClient() });
  return runExtractionPipeline({
    documentText: REPORT,
    provider,
    intake: intakeForPipeline(value),
  });
}

describe('intake feeding conflict detection', () => {
  it('fires the allergy contradiction when intake claims none but the document names one', async () => {
    const result = await run(intake({ noKnownAllergies: true }));

    // The fallback extractor reads "Allergies  Penicillin" as a row, so the document
    // does carry an allergy for intake to contradict.
    const codes = result.conflicts.map((conflict) => conflict.code);
    expect(codes).toContain('allergy_contradiction');
  });

  it('does not fire when intake makes no such claim', async () => {
    const result = await run(intake({ allergies: ['Penicillin'] }));

    expect(result.conflicts.map((c) => c.code)).not.toContain('allergy_contradiction');
  });

  it('flags a medication the patient listed twice', async () => {
    const result = await run(intake({ medications: ['Metformin', 'metformin'] }));

    expect(result.conflicts.map((c) => c.code)).toContain('duplicate_medication');
  });
});

describe('intake feeding clarification questions', () => {
  it('asks how long a symptom has lasted when no duration was given', async () => {
    const result = await run(intake({ symptoms: [{ name: 'Headache', duration: '' }] }));

    const codes = result.questions.map((question) => question.code);
    expect(codes).toContain('symptom_duration_missing');
  });

  it('does not ask when the duration was supplied', async () => {
    const result = await run(intake({ symptoms: [{ name: 'Headache', duration: '3 days' }] }));

    expect(result.questions.map((q) => q.code)).not.toContain('symptom_duration_missing');
  });

  it('asks for age when neither intake nor the document supplies one', async () => {
    const result = await run(intake());

    expect(result.questions.map((q) => q.code)).toContain('age_missing');
  });

  it('stops asking for age once intake supplies it', async () => {
    const result = await run(intake({ age: 34 }));

    expect(result.questions.map((q) => q.code)).not.toContain('age_missing');
  });

  it('stops asking for sex once intake supplies it', async () => {
    const result = await run(intake({ sex: 'female' }));

    expect(result.questions.map((q) => q.code)).not.toContain('sex_missing');
  });

  it('asks nothing about symptoms when none were entered', async () => {
    const result = await run(intake({ age: 34, sex: 'male' }));

    expect(result.questions.map((q) => q.code)).not.toContain('symptom_duration_missing');
  });
});
