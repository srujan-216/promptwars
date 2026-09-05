import { describe, expect, it } from 'vitest';

import { detectConflicts, type ConflictInput } from './detect';

const NOW = new Date('2026-09-05T00:00:00Z');

function input(overrides: Partial<ConflictInput> = {}): ConflictInput {
  return {
    intake: { noKnownAllergies: false, allergies: [], medications: [] },
    labs: [],
    now: NOW,
    ...overrides,
  };
}

describe('allergy contradiction', () => {
  it('flags "no known allergies" against a document that names one', () => {
    const conflicts = detectConflicts(
      input({
        intake: { noKnownAllergies: true, allergies: [], medications: [] },
        documentAllergies: ['penicillin'],
      }),
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.code).toBe('allergy_contradiction');
    expect(conflicts[0]?.severity).toBe('critical');
  });

  it('names the allergy in the message', () => {
    const conflicts = detectConflicts(
      input({
        intake: { noKnownAllergies: true, allergies: [], medications: [] },
        documentAllergies: ['penicillin'],
      }),
    );

    expect(conflicts[0]?.message).toContain('penicillin');
  });

  it('does not flag when intake does not claim "no known allergies"', () => {
    const conflicts = detectConflicts(
      input({
        intake: { noKnownAllergies: false, allergies: ['penicillin'], medications: [] },
        documentAllergies: ['penicillin'],
      }),
    );

    expect(conflicts).toHaveLength(0);
  });

  it('does not flag when the document mentions no allergies', () => {
    const conflicts = detectConflicts(
      input({ intake: { noKnownAllergies: true, allergies: [], medications: [] } }),
    );

    expect(conflicts).toHaveLength(0);
  });

  it('flags rather than resolves — it never says which side is correct', () => {
    const conflicts = detectConflicts(
      input({
        intake: { noKnownAllergies: true, allergies: [], medications: [] },
        documentAllergies: ['penicillin'],
      }),
    );
    const message = conflicts[0]?.message ?? '';

    expect(message).toContain('disagree');
    expect(message).not.toMatch(/should|recommend|correct value is/i);
  });
});

describe('divergent same-day results', () => {
  const base = { canonicalName: 'Hemoglobin', unit: 'g/dL', reportDate: '2026-09-01' };

  it('flags two different values for the same analyte on the same date', () => {
    const conflicts = detectConflicts(
      input({
        labs: [
          { ...base, path: 'labs.0', value: 11.2 },
          { ...base, path: 'labs.1', value: 14.8 },
        ],
      }),
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.code).toBe('divergent_same_day_result');
  });

  it('links both sides of the conflict', () => {
    const conflicts = detectConflicts(
      input({
        labs: [
          { ...base, path: 'labs.0', value: 11.2 },
          { ...base, path: 'labs.1', value: 14.8 },
        ],
      }),
    );

    expect(conflicts[0]?.paths).toEqual(['labs.0', 'labs.1']);
  });

  it('does not flag identical values reported twice', () => {
    const conflicts = detectConflicts(
      input({
        labs: [
          { ...base, path: 'labs.0', value: 11.2 },
          { ...base, path: 'labs.1', value: 11.2 },
        ],
      }),
    );

    expect(conflicts).toHaveLength(0);
  });

  it('tolerates a rounding-level difference', () => {
    const conflicts = detectConflicts(
      input({
        labs: [
          { ...base, path: 'labs.0', value: 11.2 },
          { ...base, path: 'labs.1', value: 11.2001 },
        ],
      }),
    );

    expect(conflicts).toHaveLength(0);
  });

  it('does not flag the same analyte on different dates', () => {
    const conflicts = detectConflicts(
      input({
        labs: [
          { ...base, path: 'labs.0', value: 11.2 },
          { ...base, path: 'labs.1', value: 14.8, reportDate: '2026-08-01' },
        ],
      }),
    );

    expect(conflicts).toHaveLength(0);
  });

  it('does not flag different analytes on the same date', () => {
    const conflicts = detectConflicts(
      input({
        labs: [
          { ...base, path: 'labs.0', value: 11.2 },
          { ...base, path: 'labs.1', canonicalName: 'Ferritin', value: 18 },
        ],
      }),
    );

    expect(conflicts).toHaveLength(0);
  });

  it('ignores results with no date rather than grouping them together', () => {
    const conflicts = detectConflicts(
      input({
        labs: [
          { ...base, path: 'labs.0', value: 11.2, reportDate: null },
          { ...base, path: 'labs.1', value: 14.8, reportDate: null },
        ],
      }),
    );

    expect(conflicts).toHaveLength(0);
  });
});

describe('future report date', () => {
  it('flags a date after today', () => {
    const conflicts = detectConflicts(input({ reportDate: '2026-12-25' }));

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.code).toBe('future_report_date');
    expect(conflicts[0]?.severity).toBe('warning');
  });

  it('does not flag a past date', () => {
    expect(detectConflicts(input({ reportDate: '2026-01-01' }))).toHaveLength(0);
  });

  it('does not flag today', () => {
    expect(detectConflicts(input({ reportDate: '2026-09-05' }))).toHaveLength(0);
  });

  it('ignores an unparseable date rather than guessing at it', () => {
    expect(detectConflicts(input({ reportDate: 'last Tuesday' }))).toHaveLength(0);
  });

  it('ignores an absent date', () => {
    expect(detectConflicts(input({ reportDate: null }))).toHaveLength(0);
  });
});

describe('duplicate medication', () => {
  it('flags the same medication listed twice at intake', () => {
    const conflicts = detectConflicts(
      input({
        intake: { noKnownAllergies: false, allergies: [], medications: ['Metformin', 'Metformin'] },
      }),
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.code).toBe('duplicate_medication');
  });

  it('matches case- and whitespace-insensitively', () => {
    const conflicts = detectConflicts(
      input({
        intake: { noKnownAllergies: false, allergies: [], medications: ['Metformin'] },
        documentMedications: ['  metformin  '],
      }),
    );

    expect(conflicts).toHaveLength(1);
  });

  it('does not flag two genuinely different medications', () => {
    const conflicts = detectConflicts(
      input({
        intake: { noKnownAllergies: false, allergies: [], medications: ['Metformin', 'Aspirin'] },
      }),
    );

    expect(conflicts).toHaveLength(0);
  });

  it('reports a duplicate once, not once per repetition', () => {
    const conflicts = detectConflicts(
      input({
        intake: {
          noKnownAllergies: false,
          allergies: [],
          medications: ['Metformin', 'Metformin', 'Metformin'],
        },
      }),
    );

    expect(conflicts).toHaveLength(1);
  });

  it('ignores blank entries', () => {
    const conflicts = detectConflicts(
      input({
        intake: { noKnownAllergies: false, allergies: [], medications: ['', '  '] },
      }),
    );

    expect(conflicts).toHaveLength(0);
  });
});

describe('detectConflicts overall', () => {
  it('returns an empty list for clean input', () => {
    expect(detectConflicts(input())).toEqual([]);
  });

  it('reports multiple independent conflicts together', () => {
    const conflicts = detectConflicts(
      input({
        intake: { noKnownAllergies: true, allergies: [], medications: ['Aspirin', 'aspirin'] },
        documentAllergies: ['latex'],
        reportDate: '2027-01-01',
      }),
    );

    expect(conflicts.map((c) => c.code).sort()).toEqual([
      'allergy_contradiction',
      'duplicate_medication',
      'future_report_date',
    ]);
  });

  it('is deterministic across repeated calls', () => {
    const args = input({
      intake: { noKnownAllergies: true, allergies: [], medications: [] },
      documentAllergies: ['latex'],
    });

    expect(detectConflicts(args)).toEqual(detectConflicts(args));
  });
});
