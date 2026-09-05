import { describe, expect, it } from 'vitest';

import { checkGuardrail } from '@/lib/server/ai/guardrail';
import { buildSampleResult, SAMPLE_DOCUMENT, SAMPLE_SUMMARY } from './example';

/**
 * These tests keep the recorded fixture honest.
 *
 * The worked example is the one place in the product showing text a model produced without
 * a model having run. That is safe only while the recorded text would genuinely have passed
 * the real guardrail, and while the surrounding claims stay true. Both are asserted here, so
 * the fixture cannot quietly drift into something the live system would have blocked.
 */

describe('recorded summary fixture', () => {
  it('passes the real guardrail', () => {
    expect(checkGuardrail(SAMPLE_SUMMARY.text).passed).toBe(true);
  });

  it('is labelled as a regenerated attempt, matching guardrailTriggered', () => {
    expect(SAMPLE_SUMMARY.source).toBe('regenerated');
    expect(SAMPLE_SUMMARY.guardrailTriggered).toBe(true);
    expect(SAMPLE_SUMMARY.rejectedAttemptCount).toBe(1);
  });

  it('describes only what the document printed', () => {
    expect(SAMPLE_SUMMARY.text).toContain('printed on the report');
    expect(SAMPLE_SUMMARY.text).toContain('no reference range');
  });

  it('points the reader at a clinician', () => {
    expect(SAMPLE_SUMMARY.text).toContain('qualified clinician');
  });
});

describe('buildSampleResult — the verification is real, not recorded', () => {
  it('rejects the invented Ferritin range', () => {
    const { audit } = buildSampleResult();

    // Two rejections: Ferritin's invented range, and the range attached to the Vitamin D
    // field whose quote is absent from the document entirely.
    expect(audit.hallucinatedRangesRejected).toBe(2);
    expect(
      audit.findings.some(
        (finding) =>
          finding.code === 'hallucinated_reference_range' && finding.message.includes('30 - 400'),
      ),
    ).toBe(true);
  });

  it('quarantines the unsourceable Vitamin D field', () => {
    const { audit, quarantined } = buildSampleResult();

    expect(audit.fieldsQuarantined).toBe(1);
    expect(quarantined[0]?.label).toBe('Vitamin D');
  });

  it('keeps the quarantined field out of the record entirely', () => {
    const { record } = buildSampleResult();

    expect(record.labs.some((lab) => lab.rawName === 'Vitamin D')).toBe(false);
  });

  it('evaluates Ferritin as no_reference_in_source after the rejection', () => {
    const { record } = buildSampleResult();

    expect(record.labs.find((lab) => lab.canonicalName === 'Ferritin')?.status).toBe(
      'no_reference_in_source',
    );
  });

  it('evaluates Hemoglobin against its genuine printed range', () => {
    const { record } = buildSampleResult();
    const hemoglobin = record.labs.find((lab) => lab.canonicalName === 'Hemoglobin');

    expect(hemoglobin?.status).toBe('low');
    expect(hemoglobin?.referenceText).toBe('13.0 - 17.0 g/dL');
  });

  it('normalizes PLT to its canonical name', () => {
    const { record } = buildSampleResult();

    expect(record.labs.some((lab) => lab.canonicalName === 'Platelet Count')).toBe(true);
  });

  it('fires the allergy contradiction from the sample intake', () => {
    const { conflicts } = buildSampleResult();

    expect(conflicts.map((conflict) => conflict.code)).toContain('allergy_contradiction');
  });

  it('produces clarification questions from the sample intake gaps', () => {
    const { questions } = buildSampleResult();
    const codes = questions.map((question) => question.code);

    expect(codes).toContain('symptom_duration_missing');
    expect(codes).toContain('age_missing');
  });

  it('every quoted sourceQuote that verified is genuinely in the document', () => {
    const { audit } = buildSampleResult();

    for (const field of audit.fields) {
      if (!field.verified || field.sourceQuote === null) continue;
      expect(SAMPLE_DOCUMENT).toContain(field.sourceQuote);
    }
  });

  it('is deterministic across calls', () => {
    expect(buildSampleResult().audit).toEqual(buildSampleResult().audit);
  });
});
