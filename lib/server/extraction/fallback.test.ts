import { describe, expect, it } from 'vitest';

import { createProvider } from '@/lib/server/ai/provider';
import { createPatternFallbackClient, parseReportText } from './fallback';
import { runExtractionPipeline } from './pipeline';

const REPORT = `CITY DIAGNOSTIC LABORATORY
Report Date: 2026-08-14

COMPLETE BLOOD COUNT
Hemoglobin        11.2 g/dL     13.0 - 17.0 g/dL
Ferritin          18 ng/mL
`;

describe('parseReportText', () => {
  it('reads a column-aligned row into value, unit and range', () => {
    const lab = parseReportText(REPORT).labs.find((l) => l.name === 'Hemoglobin');

    expect(lab?.value).toBe(11.2);
    expect(lab?.unit).toBe('g/dL');
    expect(lab?.referenceText).toBe('13.0 - 17.0 g/dL');
  });

  it('leaves referenceText null when the row prints no range', () => {
    const lab = parseReportText(REPORT).labs.find((l) => l.name === 'Ferritin');

    expect(lab?.referenceText).toBeNull();
  });

  it('reads the report date', () => {
    expect(parseReportText(REPORT).patient.reportDate).toBe('2026-08-14');
  });

  it('quotes the source line verbatim, so verification is genuine', () => {
    const lab = parseReportText(REPORT).labs.find((l) => l.name === 'Hemoglobin');

    expect(REPORT).toContain(lab?.sourceQuote ?? '@@none@@');
  });

  it('skips prose lines rather than inventing rows from them', () => {
    const parsed = parseReportText('This report was reviewed by the duty biochemist.');

    expect(parsed.labs).toEqual([]);
  });

  it('skips heading rows with no numeric value', () => {
    expect(parseReportText('Test              Result        Reference Range').labs).toEqual([]);
  });

  it('returns an empty result for empty input rather than throwing', () => {
    expect(parseReportText('').labs).toEqual([]);
  });
});

describe('pattern fallback through the full pipeline', () => {
  it('produces a verified, evaluated record without any model call', async () => {
    const provider = createProvider({ client: createPatternFallbackClient() });

    const result = await runExtractionPipeline({ documentText: REPORT, provider });

    const hemoglobin = result.labs.find((l) => l.canonicalName === 'Hemoglobin');

    expect(hemoglobin?.status).toBe('low');
    expect(hemoglobin?.value.verified).toBe(true);
    expect(result.audit.fieldsQuarantined).toBe(0);
  });

  it('still reports no_reference_in_source where the document printed no range', async () => {
    const provider = createProvider({ client: createPatternFallbackClient() });

    const result = await runExtractionPipeline({ documentText: REPORT, provider });

    expect(result.labs.find((l) => l.canonicalName === 'Ferritin')?.status).toBe(
      'no_reference_in_source',
    );
  });

  it('cannot invent a reference range, so nothing is rejected', async () => {
    // The honest consequence of a pattern matcher: it never hallucinates, so it also
    // cannot demonstrate rule 3. That is why the worked example uses a fixture instead.
    const provider = createProvider({ client: createPatternFallbackClient() });

    const result = await runExtractionPipeline({ documentText: REPORT, provider });

    expect(result.audit.hallucinatedRangesRejected).toBe(0);
  });
});
