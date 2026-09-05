import { describe, expect, it } from 'vitest';

import { buildDeterministicSummary, checkGuardrail } from './guardrail';

const FACTS = {
  totalResults: 4,
  outsidePrintedRange: 1,
  noReferenceInSource: 1,
  fieldsVerified: 3,
  fieldsQuarantined: 1,
  rangesRejected: 1,
};

describe('checkGuardrail — blocks disallowed language', () => {
  it.each([
    ['You have anaemia.', 'diagnosis_language'],
    ['This indicates iron deficiency.', 'diagnosis_language'],
    ['You were diagnosed with diabetes.', 'diagnosis_language'],
    ['Take ferrous sulphate 200 mg.', 'prescription_language'],
    ['Your dosage should change.', 'dosage_language'],
    ['Increase your dose next month.', 'treatment_change_language'],
    ['You should stop taking it.', 'treatment_change_language'],
    ['Nothing to worry about.', 'reassurance_language'],
    ["You're fine.", 'reassurance_language'],
  ])('rejects %j', (text, expectedCode) => {
    const result = checkGuardrail(text);

    expect(result.passed).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain(expectedCode);
  });

  it('reports the matched text so a reviewer can see what tripped it', () => {
    const result = checkGuardrail('You have anaemia.');

    expect(result.violations[0]?.match.toLowerCase()).toContain('you have');
  });

  it('reports every rule a passage breaks, not just the first', () => {
    const result = checkGuardrail('You have anaemia. Increase your dose and stop taking aspirin.');

    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });
});

describe('checkGuardrail — permits factual description', () => {
  it.each([
    'Hemoglobin was 9.4 g/dL, below the range of 13.0 - 17.0 g/dL printed on the report.',
    'Ferritin was 18 ng/mL. The report printed no reference range for it.',
    'Four results were transcribed from this document.',
    'Discuss these results with a qualified clinician.',
  ])('accepts %j', (text) => {
    expect(checkGuardrail(text).passed).toBe(true);
  });

  it('does not trip on the word "normal" describing a printed range', () => {
    expect(
      checkGuardrail('The value sits within the normal range printed on the report.').passed,
    ).toBe(true);
  });
});

describe('buildDeterministicSummary', () => {
  it('states the number of results', () => {
    expect(buildDeterministicSummary(FACTS)).toContain('4 results');
  });

  it('reports values outside the printed range without interpreting them', () => {
    expect(buildDeterministicSummary(FACTS)).toContain(
      'fell outside the reference range printed on the report itself',
    );
  });

  it('mentions results with no printed range', () => {
    expect(buildDeterministicSummary(FACTS)).toContain('had no reference range printed');
  });

  it('mentions quarantined fields', () => {
    expect(buildDeterministicSummary(FACTS)).toContain('shown separately for review');
  });

  it('mentions rejected ranges', () => {
    expect(buildDeterministicSummary(FACTS)).toContain('rejected');
  });

  it('always points the reader at a clinician', () => {
    expect(buildDeterministicSummary(FACTS)).toContain(
      'Discuss these results with a qualified clinician.',
    );
  });

  it('passes its own guardrail — this is why it is safe as a fallback', () => {
    expect(checkGuardrail(buildDeterministicSummary(FACTS)).passed).toBe(true);
  });

  it('passes the guardrail for every combination of counts', () => {
    for (const outside of [0, 1, 2]) {
      for (const quarantined of [0, 1, 2]) {
        for (const rejected of [0, 1, 2]) {
          const text = buildDeterministicSummary({
            totalResults: 3,
            outsidePrintedRange: outside,
            noReferenceInSource: 1,
            fieldsVerified: 2,
            fieldsQuarantined: quarantined,
            rangesRejected: rejected,
          });

          expect(checkGuardrail(text).passed).toBe(true);
        }
      }
    }
  });

  it('handles a single result without broken grammar', () => {
    const text = buildDeterministicSummary({
      totalResults: 1,
      outsidePrintedRange: 0,
      noReferenceInSource: 0,
      fieldsVerified: 1,
      fieldsQuarantined: 0,
      rangesRejected: 0,
    });

    expect(text).toContain('1 result.');
    expect(text).toContain('1 field was matched');
  });
});
