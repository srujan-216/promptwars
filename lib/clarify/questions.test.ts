import { describe, expect, it } from 'vitest';

import { buildClarificationQuestions, type ClarifyInput } from './questions';

/** A fully-answered intake produces no questions. Each test removes one thing. */
function complete(overrides: Partial<ClarifyInput> = {}): ClarifyInput {
  return {
    symptoms: [{ path: 'symptoms.0', name: 'Headache', duration: '3 days' }],
    age: 34,
    sex: 'female',
    reportDate: '2026-09-01',
    hasDocument: true,
    lowConfidenceFields: [],
    ...overrides,
  };
}

describe('buildClarificationQuestions — gap rules', () => {
  it('asks nothing when nothing is missing', () => {
    expect(buildClarificationQuestions(complete())).toEqual([]);
  });

  it('asks for a symptom duration when it is absent', () => {
    const questions = buildClarificationQuestions(
      complete({ symptoms: [{ path: 'symptoms.0', name: 'Headache', duration: null }] }),
    );

    expect(questions).toHaveLength(1);
    expect(questions[0]?.code).toBe('symptom_duration_missing');
    expect(questions[0]?.question).toBe('How long have you been experiencing headache?');
  });

  it('treats a blank duration as missing', () => {
    const questions = buildClarificationQuestions(
      complete({ symptoms: [{ path: 'symptoms.0', name: 'Headache', duration: '  ' }] }),
    );

    expect(questions).toHaveLength(1);
  });

  it('asks once per symptom lacking a duration', () => {
    const questions = buildClarificationQuestions(
      complete({
        symptoms: [
          { path: 'symptoms.0', name: 'Headache', duration: null },
          { path: 'symptoms.1', name: 'Fatigue', duration: null },
          { path: 'symptoms.2', name: 'Nausea', duration: '2 days' },
        ],
      }),
    );

    expect(questions).toHaveLength(2);
    expect(questions.map((q) => q.path)).toEqual(['symptoms.0', 'symptoms.1']);
  });

  it('asks for age when absent', () => {
    const questions = buildClarificationQuestions(complete({ age: null }));

    expect(questions[0]?.code).toBe('age_missing');
    expect(questions[0]?.path).toBe('patient.age');
  });

  it('asks for sex when absent', () => {
    const questions = buildClarificationQuestions(complete({ sex: null }));

    expect(questions[0]?.code).toBe('sex_missing');
  });

  it('asks for a report date when a document was supplied without one', () => {
    const questions = buildClarificationQuestions(complete({ reportDate: null }));

    expect(questions[0]?.code).toBe('report_date_missing');
  });

  it('does not ask for a report date when there is no document', () => {
    const questions = buildClarificationQuestions(
      complete({ reportDate: null, hasDocument: false }),
    );

    expect(questions).toEqual([]);
  });

  it('asks to confirm a low-confidence field', () => {
    const questions = buildClarificationQuestions(
      complete({
        lowConfidenceFields: [{ path: 'labs.0', label: 'Hemoglobin', confidence: 0.3 }],
      }),
    );

    expect(questions[0]?.code).toBe('low_confidence_field');
    expect(questions[0]?.question).toContain('Hemoglobin');
  });

  it('does not ask about a confidently-read field', () => {
    const questions = buildClarificationQuestions(
      complete({
        lowConfidenceFields: [{ path: 'labs.0', label: 'Hemoglobin', confidence: 0.95 }],
      }),
    );

    expect(questions).toEqual([]);
  });

  it('respects a custom confidence threshold', () => {
    const questions = buildClarificationQuestions(
      complete({
        lowConfidenceFields: [{ path: 'labs.0', label: 'Hemoglobin', confidence: 0.7 }],
        lowConfidenceThreshold: 0.8,
      }),
    );

    expect(questions).toHaveLength(1);
  });
});

describe('buildClarificationQuestions — output shape', () => {
  it('caps the list at five questions by default', () => {
    const questions = buildClarificationQuestions({
      symptoms: Array.from({ length: 10 }, (_, i) => ({
        path: `symptoms.${String(i)}`,
        name: `Symptom ${String(i)}`,
        duration: null,
      })),
      age: null,
      sex: null,
    });

    expect(questions).toHaveLength(5);
  });

  it('honours a custom cap', () => {
    const questions = buildClarificationQuestions({
      symptoms: [
        { path: 'symptoms.0', name: 'Headache', duration: null },
        { path: 'symptoms.1', name: 'Fatigue', duration: null },
      ],
      age: null,
      sex: null,
      maxQuestions: 3,
    });

    expect(questions).toHaveLength(3);
  });

  it('produces between three and five questions for a sparse intake', () => {
    const questions = buildClarificationQuestions({
      symptoms: [{ path: 'symptoms.0', name: 'Headache', duration: null }],
      age: null,
      sex: null,
      reportDate: null,
      hasDocument: true,
    });

    expect(questions.length).toBeGreaterThanOrEqual(3);
    expect(questions.length).toBeLessThanOrEqual(5);
  });

  it('gives every question a reason and a routable path', () => {
    const questions = buildClarificationQuestions({ age: null, sex: null });

    for (const question of questions) {
      expect(question.reason).not.toBe('');
      expect(question.path).not.toBe('');
    }
  });

  it('is deterministic and stably ordered', () => {
    const args = complete({ age: null, sex: null, reportDate: null });

    expect(buildClarificationQuestions(args)).toEqual(buildClarificationQuestions(args));
  });
});

describe('buildClarificationQuestions — asks, never advises', () => {
  it('phrases every item as a question', () => {
    const questions = buildClarificationQuestions({
      symptoms: [{ path: 'symptoms.0', name: 'Chest pain', duration: null }],
      age: null,
      sex: null,
      reportDate: null,
      hasDocument: true,
    });

    for (const question of questions) {
      expect(question.question.endsWith('?')).toBe(true);
    }
  });

  it('contains no advice, urgency or clinical judgement language', () => {
    const questions = buildClarificationQuestions({
      symptoms: [{ path: 'symptoms.0', name: 'Chest pain', duration: null }],
      age: null,
      sex: null,
      reportDate: null,
      hasDocument: true,
      lowConfidenceFields: [{ path: 'labs.0', label: 'Hemoglobin', confidence: 0.2 }],
    });

    const forbidden =
      /\b(you should|see a doctor|urgent|emergency|serious|concerning|may indicate|suggests|diagnos|treat|prescrib|dose|dosage|mg\b)/i;

    for (const question of questions) {
      expect(`${question.question} ${question.reason}`).not.toMatch(forbidden);
    }
  });
});
