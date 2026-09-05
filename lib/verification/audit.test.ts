import { describe, expect, it } from 'vitest';

import {
  auditExtraction,
  quoteAppearsInSource,
  summarizeAudit,
  type ExtractedField,
} from './audit';

/** A real report fragment. Note it prints a range for Hemoglobin but NOT for Ferritin. */
const REPORT = `
COMPLETE BLOOD COUNT
Hemoglobin        11.2 g/dL     Ref: 13 - 17 g/dL
Platelet Count    150 10^3/uL   Ref: 150 - 410 10^3/uL
Ferritin          18 ng/mL
`;

function field(overrides: Partial<ExtractedField> = {}): ExtractedField {
  return {
    path: 'labs.0.value',
    label: 'Hemoglobin',
    value: 11.2,
    origin: 'ai_extracted',
    confidence: 0.9,
    sourceQuote: 'Hemoglobin        11.2 g/dL',
    ...overrides,
  };
}

describe('quoteAppearsInSource', () => {
  it('finds an exact quote', () => {
    expect(quoteAppearsInSource(REPORT, 'Ferritin          18 ng/mL')).toBe(true);
  });

  it('tolerates collapsed whitespace', () => {
    expect(quoteAppearsInSource(REPORT, 'Hemoglobin 11.2 g/dL')).toBe(true);
  });

  it('tolerates an en-dash where the source used a hyphen', () => {
    expect(quoteAppearsInSource(REPORT, 'Ref: 13 – 17 g/dL')).toBe(true);
  });

  it('rejects text that is simply not there', () => {
    expect(quoteAppearsInSource(REPORT, 'Vitamin D 30 ng/mL')).toBe(false);
  });

  it('does not case-fold — a differently-cased quote is not evidence', () => {
    expect(quoteAppearsInSource(REPORT, 'HEMOGLOBIN 11.2 G/DL')).toBe(false);
  });

  it('rejects an empty quote', () => {
    expect(quoteAppearsInSource(REPORT, '   ')).toBe(false);
  });
});

describe('auditExtraction — rule 4, quarantine', () => {
  it('verifies a field whose quote is present', () => {
    const report = auditExtraction({ documentText: REPORT, fields: [field()] });

    expect(report.fieldsVerified).toBe(1);
    expect(report.fieldsQuarantined).toBe(0);
    expect(report.fields[0]?.verified).toBe(true);
  });

  it('quarantines a field whose quote is absent', () => {
    const report = auditExtraction({
      documentText: REPORT,
      fields: [field({ label: 'Vitamin D', sourceQuote: 'Vitamin D 30 ng/mL' })],
    });

    expect(report.fieldsQuarantined).toBe(1);
    expect(report.fields[0]?.verified).toBe(false);
    expect(report.fields[0]?.quarantined).toBe(true);
  });

  it('raises a quote_not_found finding naming the field', () => {
    const report = auditExtraction({
      documentText: REPORT,
      fields: [field({ label: 'Vitamin D', sourceQuote: 'Vitamin D 30 ng/mL' })],
    });

    const finding = report.findings.find((f) => f.code === 'quote_not_found');

    expect(finding?.severity).toBe('critical');
    expect(finding?.label).toBe('Vitamin D');
  });

  it('quarantines a field that arrived with no quote at all', () => {
    const report = auditExtraction({
      documentText: REPORT,
      fields: [field({ sourceQuote: null })],
    });

    expect(report.fieldsQuarantined).toBe(1);
    expect(report.findings.some((f) => f.code === 'quote_missing')).toBe(true);
  });

  it('keeps quarantined fields rather than discarding them', () => {
    const report = auditExtraction({
      documentText: REPORT,
      fields: [field({ sourceQuote: 'nowhere in the document' })],
    });

    expect(report.fields).toHaveLength(1);
    expect(report.fields[0]?.value).toBe(11.2);
  });

  it('does not quarantine user-provided fields for lacking a document quote', () => {
    const report = auditExtraction({
      documentText: REPORT,
      fields: [
        field({ label: 'Age', origin: 'user_provided', value: 34, sourceQuote: null }),
      ],
    });

    expect(report.fieldsQuarantined).toBe(0);
    expect(report.fields[0]?.quarantined).toBe(false);
  });

  it('counts verified and quarantined fields independently', () => {
    const report = auditExtraction({
      documentText: REPORT,
      fields: [
        field(),
        field({ path: 'labs.1.value', label: 'Ferritin', sourceQuote: 'Ferritin 18 ng/mL' }),
        field({ path: 'labs.2.value', label: 'Vitamin D', sourceQuote: 'Vitamin D 30' }),
      ],
    });

    expect(report.fieldsExtracted).toBe(3);
    expect(report.fieldsVerified).toBe(2);
    expect(report.fieldsQuarantined).toBe(1);
  });
});

describe('auditExtraction — rule 3, hallucinated range rejection', () => {
  it('accepts a reference range that is printed in the document', () => {
    const report = auditExtraction({
      documentText: REPORT,
      fields: [field({ referenceText: '13 - 17 g/dL' })],
    });

    expect(report.hallucinatedRangesRejected).toBe(0);
    expect(report.fields[0]?.referenceText).toBe('13 - 17 g/dL');
    expect(report.fields[0]?.rejectedReferenceText).toBeNull();
  });

  it('rejects a plausible-but-absent range for an analyte the report gave no range for', () => {
    // The report prints Ferritin with NO reference range. A model will readily supply
    // "30 - 400 ng/mL" from training data. That is exactly the failure this catches.
    const report = auditExtraction({
      documentText: REPORT,
      fields: [
        field({
          path: 'labs.2.value',
          label: 'Ferritin',
          value: 18,
          sourceQuote: 'Ferritin          18 ng/mL',
          referenceText: '30 - 400 ng/mL',
        }),
      ],
    });

    expect(report.hallucinatedRangesRejected).toBe(1);
    expect(report.fields[0]?.referenceText).toBeNull();
  });

  it('preserves the rejected claim so the UI can say what was discarded', () => {
    const report = auditExtraction({
      documentText: REPORT,
      fields: [
        field({ label: 'Ferritin', sourceQuote: 'Ferritin 18 ng/mL', referenceText: '30 - 400 ng/mL' }),
      ],
    });

    expect(report.fields[0]?.rejectedReferenceText).toBe('30 - 400 ng/mL');
  });

  it('raises a critical finding quoting the rejected range', () => {
    const report = auditExtraction({
      documentText: REPORT,
      fields: [
        field({ label: 'Ferritin', sourceQuote: 'Ferritin 18 ng/mL', referenceText: '30 - 400 ng/mL' }),
      ],
    });

    const finding = report.findings.find((f) => f.code === 'hallucinated_reference_range');

    expect(finding?.severity).toBe('critical');
    expect(finding?.message).toContain('30 - 400 ng/mL');
    expect(finding?.message).toContain('rejected');
  });

  it('rejects a range even when the field itself verified — the two checks are independent', () => {
    const report = auditExtraction({
      documentText: REPORT,
      fields: [
        field({ label: 'Ferritin', sourceQuote: 'Ferritin 18 ng/mL', referenceText: '30 - 400 ng/mL' }),
      ],
    });

    expect(report.fields[0]?.verified).toBe(true);
    expect(report.fields[0]?.referenceText).toBeNull();
  });

  it('rejects a subtly altered range rather than accepting a near match', () => {
    // Source says 13 - 17. A model emitting 13 - 18 must not slip through.
    const report = auditExtraction({
      documentText: REPORT,
      fields: [field({ referenceText: '13 - 18 g/dL' })],
    });

    expect(report.hallucinatedRangesRejected).toBe(1);
    expect(report.fields[0]?.referenceText).toBeNull();
  });

  it('counts multiple rejected ranges', () => {
    const report = auditExtraction({
      documentText: REPORT,
      fields: [
        field({ referenceText: '13 - 18 g/dL' }),
        field({ path: 'labs.2.value', label: 'Ferritin', sourceQuote: 'Ferritin 18 ng/mL', referenceText: '30 - 400 ng/mL' }),
      ],
    });

    expect(report.hallucinatedRangesRejected).toBe(2);
  });

  it('treats an absent range as absent, not as a rejection', () => {
    const report = auditExtraction({ documentText: REPORT, fields: [field()] });

    expect(report.hallucinatedRangesRejected).toBe(0);
    expect(report.fields[0]?.referenceText).toBeNull();
    expect(report.fields[0]?.rejectedReferenceText).toBeNull();
  });
});

describe('auditExtraction — counters and advisories', () => {
  it('reports low confidence as a warning, not a verification failure', () => {
    const report = auditExtraction({
      documentText: REPORT,
      fields: [field({ confidence: 0.2 })],
    });

    expect(report.fields[0]?.verified).toBe(true);
    expect(report.findings.find((f) => f.code === 'low_confidence')?.severity).toBe('warning');
  });

  it('passes through the AI and deterministic stage counters', () => {
    const report = auditExtraction({
      documentText: REPORT,
      fields: [field()],
      aiCallCount: 1,
      deterministicStageCount: 6,
      guardrailTriggered: true,
    });

    expect(report.aiCallCount).toBe(1);
    expect(report.deterministicStageCount).toBe(6);
    expect(report.guardrailTriggered).toBe(true);
  });

  it('handles an empty field list without inventing findings', () => {
    const report = auditExtraction({ documentText: REPORT, fields: [] });

    expect(report.fieldsExtracted).toBe(0);
    expect(report.findings).toEqual([]);
  });
});

describe('summarizeAudit', () => {
  it('states verified counts in plain language', () => {
    const report = auditExtraction({
      documentText: REPORT,
      fields: [field(), field({ path: 'b', sourceQuote: 'missing' })],
    });

    expect(summarizeAudit(report)).toContain('1 of 2 fields verified against source.');
  });

  it('mentions quarantined fields when there are any', () => {
    const report = auditExtraction({
      documentText: REPORT,
      fields: [field({ sourceQuote: 'missing' })],
    });

    expect(summarizeAudit(report)).toContain('1 quarantined pending review.');
  });

  it('mentions rejected ranges, singular', () => {
    const report = auditExtraction({
      documentText: REPORT,
      fields: [field({ referenceText: '13 - 18 g/dL' })],
    });

    expect(summarizeAudit(report)).toContain(
      '1 reference range rejected as not present in the source.',
    );
  });

  it('pluralises rejected ranges correctly', () => {
    const report = auditExtraction({
      documentText: REPORT,
      fields: [
        field({ referenceText: '13 - 18 g/dL' }),
        field({ path: 'b', referenceText: '1 - 2 g/dL' }),
      ],
    });

    expect(summarizeAudit(report)).toContain('2 reference ranges rejected');
  });

  it('says nothing about quarantine or rejection when everything verified cleanly', () => {
    const summary = summarizeAudit(auditExtraction({ documentText: REPORT, fields: [field()] }));

    expect(summary).toBe('1 of 1 fields verified against source.');
  });
});
