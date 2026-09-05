import type { QuarantinedItem } from '@/components/medical/QuarantineSection';
import type { RecordData, SimpleField } from '@/components/medical/StructuredRecord';
import type { LabResult } from '@/lib/domain/types';
import { evaluateRange } from '@/lib/ranges/evaluate';
import { normalizeAnalyteName } from '@/lib/terminology/normalize';
import type { AuditReport } from '@/lib/verification/audit';

/**
 * Turn an audit report into the view model the record components render.
 *
 * The split that matters happens here and only here: quarantined fields go to
 * `quarantined`, everything else to `record.labs`. There is no path that puts an
 * unverified field into the record, so rule 4 is a property of this function rather
 * than of each component remembering to check.
 */

export interface PresentedResult {
  record: RecordData;
  quarantined: QuarantinedItem[];
}

export interface PresentInput {
  audit: AuditReport;
  /** Unit per field path, from the extraction. */
  units: Readonly<Record<string, string | null>>;
  reportDate?: string | null;
  medications?: readonly string[];
  allergies?: readonly string[];
}

export function presentAudit(input: PresentInput): PresentedResult {
  const { audit, units, reportDate = null, medications = [], allergies = [] } = input;

  const labs: LabResult[] = audit.fields
    .filter((field) => !field.quarantined)
    .map((field): LabResult => {
      const unit = units[field.path] ?? null;
      const value = typeof field.value === 'number' ? field.value : Number.NaN;

      // field.referenceText is already null if the range was rejected, so a rejected
      // range can only ever produce no_reference_in_source here.
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

  const quarantined: QuarantinedItem[] = audit.fields
    .filter((field) => field.quarantined)
    .map((field) => ({
      path: field.path,
      label: field.label,
      value: `${String(field.value)} ${units[field.path] ?? ''}`.trim(),
      origin: field.origin,
      claimedQuote: field.sourceQuote,
      reason: 'The quoted text was not found anywhere in the document.',
    }));

  const patientInformation: SimpleField[] =
    reportDate === null
      ? []
      : [
          {
            path: 'patient.reportDate',
            label: 'Report date',
            value: reportDate,
            origin: 'ai_extracted',
            verified: true,
          },
        ];

  const toFields = (values: readonly string[], prefix: string, label: string): SimpleField[] =>
    values.map((value, index) => ({
      path: `${prefix}.${String(index)}`,
      label,
      value,
      origin: 'ai_extracted' as const,
      verified: true,
    }));

  return {
    quarantined,
    record: {
      patientInformation,
      symptoms: [],
      conditionsAndHistory: [],
      allergies: toFields(allergies, 'allergies', 'Allergy'),
      medications: toFields(medications, 'medications', 'Medication'),
      labs,
      additionalObservations: [],
    },
  };
}
