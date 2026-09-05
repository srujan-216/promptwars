import type { RecordData, SimpleField } from '@/components/medical/StructuredRecord';
import type { QuarantinedItem } from '@/components/medical/QuarantineSection';
import type { LabResult } from '@/lib/domain/types';
import { evaluateRange } from '@/lib/ranges/evaluate';
import { normalizeAnalyteName } from '@/lib/terminology/normalize';
import { auditExtraction, type AuditReport, type ExtractedField } from '@/lib/verification/audit';

/**
 * A worked example, used to render the interface.
 *
 * IMPORTANT, and stated plainly in the UI as well: the document below is SYNTHETIC and
 * the "model output" is a fixed fixture, not a live call. What is NOT faked is the
 * verification — `auditExtraction`, `evaluateRange` and `normalizeAnalyteName` are the
 * real production functions, run over this input. The integrity panel therefore shows
 * genuine output from the real checks, which is the only reason it is worth showing.
 *
 * The fixture deliberately contains three situations:
 *   1. Hemoglobin  — a genuine printed range, correctly extracted.
 *   2. Ferritin    — NO printed range, with the model supplying a plausible one from
 *                    training data. Rule 3 rejects it.
 *   3. Vitamin D   — a value whose quoted source text is nowhere in the document.
 *                    Rule 4 quarantines it.
 */

export const SAMPLE_DOCUMENT = `CITY DIAGNOSTIC LABORATORY
Report Date: 2026-08-14

COMPLETE BLOOD COUNT
Test              Result        Reference Range
Hemoglobin        11.2 g/dL     13.0 - 17.0 g/dL
Platelet Count    380 10^3/uL   150 - 410 10^3/uL

CHEMISTRY
Ferritin          18 ng/mL
`;

/** Fixed stand-in for model output. Not a live call — see the note above. */
const SIMULATED_MODEL_FIELDS: readonly ExtractedField[] = [
  {
    path: 'labs.0',
    label: 'Hemoglobin',
    value: 11.2,
    origin: 'ai_extracted',
    confidence: 0.96,
    sourceQuote: 'Hemoglobin        11.2 g/dL     13.0 - 17.0 g/dL',
    referenceText: '13.0 - 17.0 g/dL',
  },
  {
    path: 'labs.1',
    label: 'PLT',
    value: 380,
    origin: 'ai_extracted',
    confidence: 0.93,
    sourceQuote: 'Platelet Count    380 10^3/uL   150 - 410 10^3/uL',
    referenceText: '150 - 410 10^3/uL',
  },
  {
    // The report prints no range for Ferritin. The model supplies one anyway.
    path: 'labs.2',
    label: 'Ferritin',
    value: 18,
    origin: 'ai_extracted',
    confidence: 0.88,
    sourceQuote: 'Ferritin          18 ng/mL',
    referenceText: '30 - 400 ng/mL',
  },
  {
    // Nothing in the document says this.
    path: 'labs.3',
    label: 'Vitamin D',
    value: 22,
    origin: 'ai_extracted',
    confidence: 0.41,
    sourceQuote: 'Vitamin D         22 ng/mL     30 - 100 ng/mL',
    referenceText: '30 - 100 ng/mL',
  },
];

const UNITS: Readonly<Record<string, string>> = {
  'labs.0': 'g/dL',
  'labs.1': '10^3/uL',
  'labs.2': 'ng/mL',
  'labs.3': 'ng/mL',
};

export interface SampleResult {
  audit: AuditReport;
  record: RecordData;
  quarantined: QuarantinedItem[];
}

/** Run the real verification and range code over the fixture. */
export function buildSampleResult(): SampleResult {
  const audit = auditExtraction({
    documentText: SAMPLE_DOCUMENT,
    fields: SIMULATED_MODEL_FIELDS,
    aiCallCount: 1,
    deterministicStageCount: 6,
  });

  const verifiedFields = audit.fields.filter((field) => !field.quarantined);

  const labs: LabResult[] = verifiedFields.map((field): LabResult => {
    const unit = UNITS[field.path] ?? null;
    const value = typeof field.value === 'number' ? field.value : Number.NaN;
    const evaluated = evaluateRange({
      value,
      unit,
      referenceText: field.referenceText,
      refUnit: unit,
    });

    return {
      rawName: field.label,
      canonicalName: normalizeAnalyteName(field.label).canonical,
      value: {
        value,
        origin: 'ai_extracted',
        confidence: field.confidence,
        verified: field.verified,
        ...(field.sourceQuote !== null
          ? { source: { page: 1, quote: field.sourceQuote, offset: 0 } }
          : {}),
      },
      unit,
      referenceText: field.referenceText,
      refLow: evaluated.refLow,
      refHigh: evaluated.refHigh,
      refUnit: unit,
      status: evaluated.status,
    };
  });

  const patientInformation: SimpleField[] = [
    {
      path: 'patient.reportDate',
      label: 'Report date',
      value: '2026-08-14',
      origin: 'ai_extracted',
      verified: true,
    },
  ];

  const quarantined: QuarantinedItem[] = audit.fields
    .filter((field) => field.quarantined)
    .map((field) => ({
      path: field.path,
      label: field.label,
      value: `${String(field.value)} ${UNITS[field.path] ?? ''}`.trim(),
      origin: field.origin,
      claimedQuote: field.sourceQuote,
      reason: 'The quoted text was not found anywhere in the document.',
    }));

  return {
    audit,
    quarantined,
    record: {
      patientInformation,
      symptoms: [],
      conditionsAndHistory: [],
      allergies: [],
      medications: [],
      labs,
      additionalObservations: [],
    },
  };
}
