import 'server-only';

import { buildClarificationQuestions, type ClarificationQuestion } from '@/lib/clarify/questions';
import { compareReports, type ComparableResult, type ComparedRow } from '@/lib/compare/diff';
import { detectConflicts, type Conflict } from '@/lib/conflicts/detect';
import type { LabResult } from '@/lib/domain/types';
import { evaluateRange } from '@/lib/ranges/evaluate';
import { normalizeAnalyteName } from '@/lib/terminology/normalize';
import {
  auditExtraction,
  type AuditReport,
  type ExtractedField,
} from '@/lib/verification/audit';
import { ProviderError, type Provider } from '@/lib/server/ai/provider';
import {
  EXTRACTION_SYSTEM_INSTRUCTION,
  buildExtractionPrompt,
} from '@/lib/server/extraction/prompt';
import {
  extractionResponseGeminiSchema,
  extractionResponseSchema,
  type ExtractionResponse,
} from '@/lib/server/extraction/schema';

/**
 * The pipeline (CLAUDE.md).
 *
 *   Extraction → Zod validation → Verification → Normalization → Range Analysis →
 *   Conflict Detection → Clarification
 *
 * Exactly ONE stage calls a model. The other six are pure functions from Block A. That
 * ratio is the Efficiency argument and it is reported honestly in the result, so a
 * reader can check the claim rather than take it on faith.
 *
 * Order matters and is not arbitrary: verification runs BEFORE range analysis, so that a
 * hallucinated reference range is stripped before anything tries to compare against it.
 */

export type PipelineErrorCode = 'extraction_failed' | 'invalid_model_output' | 'empty_document';

export class PipelineError extends Error {
  readonly code: PipelineErrorCode;
  /** Safe to show a user. Never contains document text or raw model output. */
  readonly userMessage: string;
  /** The provider's failure code, when the failure came from there. Safe to log. */
  readonly providerCode: string | undefined;

  constructor(
    code: PipelineErrorCode,
    userMessage: string,
    technical?: string,
    providerCode?: string,
  ) {
    super(technical ?? userMessage);
    this.name = 'PipelineError';
    this.code = code;
    this.userMessage = userMessage;
    this.providerCode = providerCode;
  }
}

export interface StageTrace {
  stage: string;
  /** True when the stage ran without calling a model. */
  deterministic: boolean;
  aiCalls: number;
}

export interface PipelineInput {
  documentText: string;
  provider: Provider;
  intake?: {
    noKnownAllergies: boolean;
    allergies: readonly string[];
    medications: readonly string[];
    age: number | null;
    sex: string | null;
    symptoms: readonly { path: string; name: string; duration: string | null }[];
  };
  /** Optional previous report's results, for comparison. */
  previousResults?: readonly ComparableResult[];
  now?: Date;
}

export interface PipelineResult {
  labs: LabResult[];
  patient: ExtractionResponse['patient'];
  medications: string[];
  allergies: string[];
  audit: AuditReport;
  conflicts: Conflict[];
  questions: ClarificationQuestion[];
  comparison: ComparedRow[];
  trace: StageTrace[];
  /** True when the model was not called at all because the input was already cached. */
  servedFromCache: boolean;
}

const EMPTY_INTAKE = {
  noKnownAllergies: false,
  allergies: [] as readonly string[],
  medications: [] as readonly string[],
  age: null,
  sex: null,
  symptoms: [] as readonly { path: string; name: string; duration: string | null }[],
};

export async function runExtractionPipeline(input: PipelineInput): Promise<PipelineResult> {
  const {
    documentText,
    provider,
    intake = EMPTY_INTAKE,
    previousResults = [],
    now = new Date(),
  } = input;

  if (documentText.trim() === '') {
    throw new PipelineError('empty_document', 'No document text was provided.');
  }

  const trace: StageTrace[] = [];

  // --- Stage 1: Extraction (the ONLY model call) -------------------------------
  let raw: unknown;
  let aiCalls = 0;
  let servedFromCache = false;

  try {
    const result = await provider.generate({
      systemInstruction: EXTRACTION_SYSTEM_INSTRUCTION,
      prompt: buildExtractionPrompt({ documentText }),
      responseSchema: extractionResponseGeminiSchema,
    });
    raw = result.data;
    aiCalls = result.callCount;
    servedFromCache = result.cached;
  } catch (cause) {
    // Typed and generic. The raw provider message never reaches the user.
    const technical =
      cause instanceof ProviderError ? `${cause.code}: ${cause.message}` : undefined;

    throw new PipelineError(
      'extraction_failed',
      'The document could not be read. Please check it and try again.',
      technical,
      cause instanceof ProviderError ? cause.code : undefined,
    );
  }

  trace.push({ stage: 'Extraction', deterministic: false, aiCalls });

  // --- Stage 2: Zod validation of model output (rule 1) ------------------------
  const parsed = extractionResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PipelineError(
      'invalid_model_output',
      'The document could not be read in the expected format. Please try again.',
      parsed.error.issues.map((i) => i.path.join('.')).join(', '),
    );
  }
  const extraction = parsed.data;
  trace.push({ stage: 'Schema validation', deterministic: true, aiCalls: 0 });

  // --- Stage 3: Verification (rules 3 and 4) -----------------------------------
  // Runs before range analysis so hallucinated ranges are gone before anything compares.
  const fields: ExtractedField[] = extraction.labs.map((lab, index) => ({
    path: `labs.${String(index)}`,
    label: lab.name,
    value: lab.value,
    origin: 'ai_extracted' as const,
    confidence: lab.confidence,
    sourceQuote: lab.sourceQuote,
    referenceText: lab.referenceText,
  }));

  const audit = auditExtraction({
    documentText,
    fields,
    aiCallCount: aiCalls,
    // Six deterministic stages follow extraction; counted below once they have all run.
    deterministicStageCount: 6,
  });
  trace.push({ stage: 'Verification', deterministic: true, aiCalls: 0 });

  // --- Stage 4 & 5: Normalization, then Range Analysis -------------------------
  const labs: LabResult[] = audit.fields.map((field, index) => {
    const source = extraction.labs[index];
    const unit = source?.unit ?? null;
    const normalized = normalizeAnalyteName(field.label);

    // Only a verbatim-verified range reaches evaluateRange. A rejected range is
    // already null here, so the result is no_reference_in_source — exactly rule 3.
    const evaluated = evaluateRange({
      value: typeof field.value === 'number' ? field.value : Number.NaN,
      unit,
      referenceText: field.referenceText,
      refUnit: unit,
    });

    return {
      rawName: field.label,
      canonicalName: normalized.canonical,
      value: {
        value: typeof field.value === 'number' ? field.value : Number.NaN,
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
  trace.push({ stage: 'Normalization', deterministic: true, aiCalls: 0 });
  trace.push({ stage: 'Range analysis', deterministic: true, aiCalls: 0 });

  // --- Stage 6: Conflict detection ---------------------------------------------
  const conflicts = detectConflicts({
    intake: {
      noKnownAllergies: intake.noKnownAllergies,
      allergies: intake.allergies,
      medications: intake.medications,
    },
    labs: labs.map((lab, index) => ({
      path: `labs.${String(index)}`,
      canonicalName: lab.canonicalName,
      value: lab.value.value,
      unit: lab.unit,
      reportDate: extraction.patient.reportDate,
    })),
    documentAllergies: extraction.allergies,
    documentMedications: extraction.medications,
    reportDate: extraction.patient.reportDate,
    now,
  });
  trace.push({ stage: 'Conflict detection', deterministic: true, aiCalls: 0 });

  // --- Stage 7: Clarification ---------------------------------------------------
  const questions = buildClarificationQuestions({
    symptoms: intake.symptoms,
    age: intake.age ?? extraction.patient.age,
    sex: intake.sex ?? extraction.patient.sex,
    reportDate: extraction.patient.reportDate,
    hasDocument: true,
    lowConfidenceFields: audit.fields
      .filter((f) => f.confidence <= 0.5)
      .map((f) => ({ path: f.path, label: f.label, confidence: f.confidence })),
  });
  trace.push({ stage: 'Clarification', deterministic: true, aiCalls: 0 });

  // --- Comparison (only when a previous report was supplied) --------------------
  const comparison =
    previousResults.length > 0
      ? compareReports(
          previousResults,
          labs.map((lab) => ({
            canonicalName: lab.canonicalName,
            value: lab.value.value,
            unit: lab.unit,
          })),
        )
      : [];

  return {
    labs,
    patient: extraction.patient,
    medications: extraction.medications,
    allergies: extraction.allergies,
    audit,
    conflicts,
    questions,
    comparison,
    trace,
    servedFromCache,
  };
}
