import { describe, expect, it } from 'vitest';

import {
  aliasCount,
  knownCanonicalNames,
  normalizeAnalyteName,
  toLookupKey,
} from './normalize';

describe('normalizeAnalyteName — known aliases', () => {
  it.each([
    ['Hb', 'Hemoglobin'],
    ['HGB', 'Hemoglobin'],
    ['Haemoglobin', 'Hemoglobin'],
    ['WBC', 'White Blood Cell Count'],
    ['TLC', 'White Blood Cell Count'],
    ['Total Leukocyte Count', 'White Blood Cell Count'],
    ['RBC', 'Red Blood Cell Count'],
    ['PLT', 'Platelet Count'],
    ['PCV', 'Hematocrit'],
    ['HCT', 'Hematocrit'],
    ['FBS', 'Fasting Blood Glucose'],
    ['Fasting Blood Sugar', 'Fasting Blood Glucose'],
    ['HbA1c', 'Glycated Hemoglobin (HbA1c)'],
    ['SGPT', 'Alanine Aminotransferase (ALT)'],
    ['ALT', 'Alanine Aminotransferase (ALT)'],
    ['SGOT', 'Aspartate Aminotransferase (AST)'],
    ['TSH', 'Thyroid Stimulating Hormone (TSH)'],
    ['LDL', 'LDL Cholesterol'],
    ['HDL', 'HDL Cholesterol'],
    ['TG', 'Triglycerides'],
    ['Creatinine', 'Serum Creatinine'],
    ['BUN', 'Blood Urea Nitrogen'],
    ['Na', 'Sodium'],
    ['K', 'Potassium'],
    ['Vitamin B12', 'Vitamin B12'],
    ['CRP', 'C-Reactive Protein'],
    ['ESR', 'Erythrocyte Sedimentation Rate'],
    ['MCV', 'Mean Corpuscular Volume'],
  ])('maps %s to %s', (input, expected) => {
    const result = normalizeAnalyteName(input);

    expect(result.canonical).toBe(expected);
    expect(result.normalized).toBe(true);
  });
});

describe('normalizeAnalyteName — matching is insensitive to formatting', () => {
  it('ignores case', () => {
    expect(normalizeAnalyteName('hb').canonical).toBe('Hemoglobin');
    expect(normalizeAnalyteName('HB').canonical).toBe('Hemoglobin');
  });

  it('ignores surrounding whitespace', () => {
    expect(normalizeAnalyteName('  WBC  ').canonical).toBe('White Blood Cell Count');
  });

  it('ignores internal spacing', () => {
    expect(normalizeAnalyteName('Total  Cholesterol').canonical).toBe('Total Cholesterol');
  });

  it('ignores hyphens and periods', () => {
    expect(normalizeAnalyteName('total-cholesterol').canonical).toBe('Total Cholesterol');
    expect(normalizeAnalyteName('T.S.H.').canonical).toBe('Thyroid Stimulating Hormone (TSH)');
  });

  it('preserves the raw name exactly as supplied', () => {
    expect(normalizeAnalyteName('  hGb  ').raw).toBe('hGb');
  });
});

describe('normalizeAnalyteName — unknown names', () => {
  it('returns an unknown name unchanged', () => {
    const result = normalizeAnalyteName('Serum Widgetase');

    expect(result.canonical).toBe('Serum Widgetase');
    expect(result.normalized).toBe(false);
  });

  it('does not guess at a near-miss', () => {
    // Deliberately close to "Hemoglobin" — fuzzy matching would merge two analytes.
    const result = normalizeAnalyteName('Hemoglobinopathy Screen');

    expect(result.normalized).toBe(false);
    expect(result.canonical).toBe('Hemoglobinopathy Screen');
  });

  it('treats an empty name as unknown rather than throwing', () => {
    const result = normalizeAnalyteName('   ');

    expect(result.canonical).toBe('');
    expect(result.normalized).toBe(false);
  });
});

describe('alias table integrity', () => {
  it('carries at least 30 aliases', () => {
    expect(aliasCount()).toBeGreaterThanOrEqual(30);
  });

  it('is deterministic — the same input always yields the same output', () => {
    const first = normalizeAnalyteName('SGPT');
    const second = normalizeAnalyteName('SGPT');

    expect(first).toEqual(second);
  });

  it('every canonical name is itself a stable fixed point', () => {
    // Normalizing an already-canonical name must never change it. Without this,
    // running the pipeline twice could drift a name.
    for (const canonical of knownCanonicalNames()) {
      const result = normalizeAnalyteName(canonical);

      expect(result.canonical).toBe(canonical);
    }
  });
});

describe('toLookupKey', () => {
  it('strips punctuation and case', () => {
    expect(toLookupKey('HbA1c')).toBe('hba1c');
    expect(toLookupKey('Vitamin D (25-OH)')).toBe('vitamind25oh');
  });
});
