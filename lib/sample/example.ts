import type { QuarantinedItem } from '@/components/medical/QuarantineSection';
import type { RecordData } from '@/components/medical/StructuredRecord';
import type { SummaryView } from '@/components/medical/SummarySection';
import { buildClarificationQuestions, type ClarificationQuestion } from '@/lib/clarify/questions';
import { detectConflicts, type Conflict } from '@/lib/conflicts/detect';
import { intakeForPipeline } from '@/lib/intake/present';
import { EMPTY_INTAKE, type Intake } from '@/lib/intake/schema';
import { presentAudit } from '@/lib/view/present';
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

Allergies         Penicillin
`;

/** Intake a patient might have entered alongside that document. */
export const SAMPLE_INTAKE: Intake = {
  ...EMPTY_INTAKE,
  identifier: 'Example patient',
  age: null,
  sex: null,
  symptoms: [{ name: 'Fatigue', duration: '' }],
  // Contradicts the document, which lists Penicillin. That is deliberate.
  noKnownAllergies: true,
};

/**
 * A RECORDED model response, captured from a real run. Not generated at render time and
 * not a live call.
 *
 * The recorded run tripped the guardrail on its first attempt — the model wrote "you have
 * mild anaemia" — so it was rejected and regenerated under a stricter instruction. The text
 * below is the accepted second attempt. `lib/sample/example.test.ts` asserts it passes
 * `checkGuardrail`, so this fixture cannot drift into something the real guardrail would
 * have blocked.
 */
export const SAMPLE_SUMMARY: SummaryView = {
  text: 'This report lists three measurements. Hemoglobin was 11.2 g/dL, below the range of 13.0 - 17.0 g/dL printed on the report. Ferritin was 18 ng/mL and the report printed no reference range for it, so no comparison was made. Discuss these results with a qualified clinician.',
  source: 'regenerated',
  guardrailTriggered: true,
  rejectedAttemptCount: 1,
};

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
  conflicts: Conflict[];
  questions: ClarificationQuestion[];
  summary: SummaryView;
}

/** Run the real verification and range code over the fixture. */
export function buildSampleResult(): SampleResult {
  const audit = auditExtraction({
    documentText: SAMPLE_DOCUMENT,
    fields: SIMULATED_MODEL_FIELDS,
    aiCallCount: 1,
    deterministicStageCount: 6,
  });

  const presented = presentAudit({ audit, units: UNITS, reportDate: '2026-08-14' });
  const shapedIntake = intakeForPipeline(SAMPLE_INTAKE);

  // Real rules over fixture input. Only the model response is recorded.
  const conflicts = detectConflicts({
    intake: {
      noKnownAllergies: shapedIntake.noKnownAllergies,
      allergies: shapedIntake.allergies,
      medications: shapedIntake.medications,
    },
    labs: [],
    documentAllergies: ['Penicillin'],
    reportDate: '2026-08-14',
    now: new Date('2026-09-05T00:00:00Z'),
  });

  const questions = buildClarificationQuestions({
    symptoms: shapedIntake.symptoms,
    age: shapedIntake.age,
    sex: shapedIntake.sex,
    reportDate: '2026-08-14',
    hasDocument: true,
    lowConfidenceFields: audit.fields
      .filter((field) => field.confidence <= 0.5)
      .map((field) => ({ path: field.path, label: field.label, confidence: field.confidence })),
  });

  return {
    audit,
    record: presented.record,
    quarantined: presented.quarantined,
    conflicts,
    questions,
    summary: SAMPLE_SUMMARY,
  };
}
