import { describe, expect, it } from 'vitest';

import { intakeForPipeline, intakeToSections, provenancedUserValue } from './present';
import { EMPTY_INTAKE, intakeSchema, linesToList, type Intake } from './schema';

function intake(overrides: Partial<Intake> = {}): Intake {
  return { ...EMPTY_INTAKE, ...overrides };
}

describe('provenancedUserValue', () => {
  it('marks the value user_provided', () => {
    expect(provenancedUserValue('34').origin).toBe('user_provided');
  });

  it('records certainty about provenance, not about truth', () => {
    const provenanced = provenancedUserValue('34');

    // confidence 1 means "we know a person typed this", never "this is correct".
    expect(provenanced.confidence).toBe(1);
    expect(provenanced.verified).toBe(true);
  });
});

describe('intakeToSections', () => {
  it('puts identifier, age and sex under patient information', () => {
    const sections = intakeToSections(intake({ identifier: 'AB-1', age: 34, sex: 'female' }));

    expect(sections.patientInformation.map((f) => f.value)).toEqual(['AB-1', '34', 'Female']);
  });

  it('omits fields the user left blank rather than inventing placeholders', () => {
    expect(intakeToSections(EMPTY_INTAKE).patientInformation).toEqual([]);
  });

  it('marks every intake field as user_provided', () => {
    const sections = intakeToSections(
      intake({
        identifier: 'AB-1',
        age: 34,
        sex: 'male',
        symptoms: [{ name: 'Headache', duration: '3 days' }],
        conditions: ['Asthma'],
        allergies: ['Penicillin'],
        medications: ['Metformin'],
        notes: 'Feeling tired.',
      }),
    );

    const all = [
      ...sections.patientInformation,
      ...sections.symptoms,
      ...sections.conditionsAndHistory,
      ...sections.allergies,
      ...sections.medications,
      ...sections.additionalObservations,
    ];

    expect(all.length).toBeGreaterThan(0);
    for (const field of all) {
      expect(field.origin).toBe('user_provided');
    }
  });

  it('says so explicitly when a symptom has no duration', () => {
    const sections = intakeToSections(
      intake({ symptoms: [{ name: 'Headache', duration: '' }] }),
    );

    expect(sections.symptoms[0]?.value).toBe('Duration not given');
  });

  it('renders "no known allergies" as a stated claim rather than an empty list', () => {
    const sections = intakeToSections(intake({ noKnownAllergies: true }));

    expect(sections.allergies[0]?.value).toContain('No known allergies (stated by patient)');
  });
});

describe('intakeForPipeline', () => {
  it('converts a blank duration to null so clarification can detect the gap', () => {
    const shaped = intakeForPipeline(intake({ symptoms: [{ name: 'Headache', duration: '' }] }));

    expect(shaped.symptoms[0]?.duration).toBeNull();
  });

  it('preserves a supplied duration', () => {
    const shaped = intakeForPipeline(
      intake({ symptoms: [{ name: 'Headache', duration: '3 days' }] }),
    );

    expect(shaped.symptoms[0]?.duration).toBe('3 days');
  });

  it('carries the allergy claim through for conflict detection', () => {
    const shaped = intakeForPipeline(intake({ noKnownAllergies: true }));

    expect(shaped.noKnownAllergies).toBe(true);
  });
});

describe('intakeSchema', () => {
  it('accepts an entirely empty intake', () => {
    expect(intakeSchema.safeParse(EMPTY_INTAKE).success).toBe(true);
  });

  it('rejects a negative age', () => {
    const result = intakeSchema.safeParse({ ...EMPTY_INTAKE, age: -1 });

    expect(result.success).toBe(false);
  });

  it('rejects an implausible age', () => {
    expect(intakeSchema.safeParse({ ...EMPTY_INTAKE, age: 500 }).success).toBe(false);
  });

  it('rejects a fractional age', () => {
    expect(intakeSchema.safeParse({ ...EMPTY_INTAKE, age: 34.5 }).success).toBe(false);
  });

  it('rejects an unknown sex value rather than passing it through', () => {
    expect(intakeSchema.safeParse({ ...EMPTY_INTAKE, sex: 'other-thing' }).success).toBe(false);
  });

  it('rejects a symptom row with no name', () => {
    const result = intakeSchema.safeParse({
      ...EMPTY_INTAKE,
      symptoms: [{ name: '', duration: '2 days' }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects listing an allergy while also claiming none are known', () => {
    const result = intakeSchema.safeParse({
      ...EMPTY_INTAKE,
      allergies: ['Penicillin'],
      noKnownAllergies: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['allergies']);
    }
  });

  it('allows "no known allergies" on its own', () => {
    expect(
      intakeSchema.safeParse({ ...EMPTY_INTAKE, noKnownAllergies: true }).success,
    ).toBe(true);
  });
});

describe('linesToList', () => {
  it('splits on newlines and trims', () => {
    expect(linesToList('Metformin\n  Aspirin  ')).toEqual(['Metformin', 'Aspirin']);
  });

  it('drops blank lines rather than producing empty entries', () => {
    expect(linesToList('Metformin\n\n\nAspirin')).toEqual(['Metformin', 'Aspirin']);
  });

  it('returns an empty list for empty input', () => {
    expect(linesToList('   ')).toEqual([]);
  });
});
