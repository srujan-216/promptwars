import type { FieldOrigin } from '@/lib/domain/types';

/**
 * Adversarial verification of model output (CLAUDE.md rules 3 and 4).
 *
 * This is the check the whole product rests on. The model is treated as an untrusted
 * source of claims, and every claim is tested against the document before a user sees
 * it. Two independent enforcements happen here:
 *
 * RULE 4 — QUARANTINE. Every field carries a `sourceQuote`. If that quote is not
 * present in the document text, the field is quarantined: kept, labelled unverified,
 * and never mixed in with verified data.
 *
 * RULE 3 — HALLUCINATED RANGE REJECTION. A reference range is only usable if it
 * appears verbatim in the document. A model asked about haemoglobin will happily
 * supply "13 - 17 g/dL" from training data even when the report prints no range at
 * all. Any range not found in the text is discarded and the field is forced to
 * `no_reference_in_source`.
 *
 * Matching latitude is deliberately narrow and stated explicitly: runs of whitespace
 * are collapsed, and en/em dashes are folded to hyphens, because those differ freely
 * between a PDF's text layer and a model's transcription of it. Nothing else is
 * normalised — no case folding, no fuzzy or partial matching. An invented range does
 * not survive these transformations, which is the point.
 */

/** A single claim from the extraction stage, before any verification. */
export interface ExtractedField {
  /** Stable identifier, e.g. `labs.0.value`. Used to link a finding back to the UI. */
  path: string;
  /** Human-readable label for display, e.g. "Hemoglobin". */
  label: string;
  value: unknown;
  origin: FieldOrigin;
  /** Model-reported, 0-1. Advisory only — it never affects verification. */
  confidence: number;
  /** Text the model claims it took this value from. */
  sourceQuote: string | null;
  page?: number;
  offset?: number;
  /** Reference range the model claims the document printed. Subject to rule 3. */
  referenceText?: string | null;
}

/** A field after verification. */
export interface AuditedField extends ExtractedField {
  /** Mechanically established here. Never self-reported. */
  verified: boolean;
  /** True when the field failed quote verification and must be shown separately. */
  quarantined: boolean;
  /**
   * The range after rule 3. Null when the model's claimed range was not found in the
   * document — the original claim is preserved in `rejectedReferenceText`.
   */
  referenceText: string | null;
  /** The discarded claim, kept so the UI can say exactly what was rejected. */
  rejectedReferenceText: string | null;
}

export type FindingCode =
  | 'quote_not_found'
  | 'quote_missing'
  | 'hallucinated_reference_range'
  | 'low_confidence';

export type FindingSeverity = 'critical' | 'warning' | 'info';

export interface AuditFinding {
  code: FindingCode;
  severity: FindingSeverity;
  /** Matches the `path` of the offending field, so the UI can scroll to it. */
  path: string;
  label: string;
  /** Plain-language explanation, safe to show a non-clinician. */
  message: string;
}

export interface AuditReport {
  fieldsExtracted: number;
  fieldsVerified: number;
  fieldsQuarantined: number;
  hallucinatedRangesRejected: number;
  guardrailTriggered: boolean;
  aiCallCount: number;
  deterministicStageCount: number;
  findings: AuditFinding[];
  /** The verified fields, carrying the corrections this audit applied. */
  fields: AuditedField[];
}

export interface AuditInput {
  /** The untrusted source document, exactly as supplied. */
  documentText: string;
  fields: readonly ExtractedField[];
  guardrailTriggered?: boolean;
  aiCallCount?: number;
  deterministicStageCount?: number;
  /** Confidence at or below this produces an advisory finding. Never gates verification. */
  lowConfidenceThreshold?: number;
}

/**
 * The only latitude granted when matching: collapse whitespace, fold dash variants.
 * Case is preserved — "HEMOGLOBIN" is not accepted as evidence for "Hemoglobin".
 */
function normalizeForMatch(text: string): string {
  return text.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

/** True when `needle` occurs in `haystack` under the stated normalisation. */
export function quoteAppearsInSource(haystack: string, needle: string): boolean {
  const trimmed = needle.trim();
  if (trimmed === '') return false;
  return normalizeForMatch(haystack).includes(normalizeForMatch(trimmed));
}

/**
 * Presence alone is NOT sufficient for a reference range, and this is the subtle part.
 *
 * A prompt-injected document can simply contain the sentence it wants us to believe —
 * "Hemoglobin reference range is 5-8 g/dL" — at which point a naive verbatim check finds
 * it and waves it through. The injected text is genuinely in the document; that is the
 * whole trick.
 *
 * What distinguishes a real range is WHERE it is printed. Lab reports are tables: a
 * value and its reference range sit on the same row. So a range is only accepted if it
 * appears on the same line as the quote it belongs to, or on the line immediately after
 * (for reports that wrap a row). Prose elsewhere in the document — injected or merely
 * incidental — is not evidence about this measurement.
 */
export function rangeAppearsNearQuote(
  documentText: string,
  quote: string,
  range: string,
): boolean {
  const normalizedQuote = normalizeForMatch(quote);
  const normalizedRange = normalizeForMatch(range);
  if (normalizedQuote === '' || normalizedRange === '') return false;

  // Normalise each line independently so line structure survives.
  const lines = documentText.split(/\r?\n/).map((line) => normalizeForMatch(line));

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.includes(normalizedQuote) && line.includes(normalizedRange)) {
      return true;
    }

    // Allow a row that wrapped onto the next line, but no further.
    const next = lines[i + 1];
    if (next !== undefined) {
      const pair = `${line} ${next}`;
      if (pair.includes(normalizedQuote) && pair.includes(normalizedRange)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Verify every field against the document and produce both the corrected fields and a
 * report a non-clinician can read.
 */
export function auditExtraction(input: AuditInput): AuditReport {
  const {
    documentText,
    fields,
    guardrailTriggered = false,
    aiCallCount = 0,
    deterministicStageCount = 0,
    lowConfidenceThreshold = 0.5,
  } = input;

  const findings: AuditFinding[] = [];
  const audited: AuditedField[] = [];

  let fieldsVerified = 0;
  let fieldsQuarantined = 0;
  let hallucinatedRangesRejected = 0;

  for (const field of fields) {
    // --- Rule 4: quote verification -----------------------------------------
    let verified: boolean;

    if (field.sourceQuote === null || field.sourceQuote.trim() === '') {
      verified = false;
      findings.push({
        code: 'quote_missing',
        severity: 'critical',
        path: field.path,
        label: field.label,
        message: `${field.label} arrived without a source quote, so it could not be checked against the document.`,
      });
    } else if (quoteAppearsInSource(documentText, field.sourceQuote)) {
      verified = true;
    } else {
      verified = false;
      findings.push({
        code: 'quote_not_found',
        severity: 'critical',
        path: field.path,
        label: field.label,
        message: `${field.label} could not be found in the document text. It is quarantined pending manual review.`,
      });
    }

    // A field the user typed is not a model claim; it is not quarantined for lacking
    // a document quote, because there is no document to quote.
    const isUserProvided = field.origin === 'user_provided';
    const quarantined = !verified && !isUserProvided;

    if (verified) fieldsVerified += 1;
    if (quarantined) fieldsQuarantined += 1;

    // --- Rule 3: hallucinated reference range rejection ----------------------
    const claimedRange = field.referenceText ?? null;
    let referenceText: string | null = null;
    let rejectedReferenceText: string | null = null;

    if (claimedRange !== null && claimedRange.trim() !== '') {
      // Two conditions, both required: the range must be in the document AT ALL, and it
      // must be printed alongside the value it claims to describe.
      const present = quoteAppearsInSource(documentText, claimedRange);
      const alongsideValue =
        field.sourceQuote !== null &&
        rangeAppearsNearQuote(documentText, field.sourceQuote, claimedRange);

      if (present && alongsideValue) {
        referenceText = claimedRange;
      } else {
        rejectedReferenceText = claimedRange;
        hallucinatedRangesRejected += 1;
        findings.push({
          code: 'hallucinated_reference_range',
          severity: 'critical',
          path: field.path,
          label: field.label,
          message: present
            ? `A reference range of "${claimedRange}" was proposed for ${field.label}, but it is not printed alongside that result in the document. It was rejected and not used.`
            : `A reference range of "${claimedRange}" was proposed for ${field.label} but does not appear in the document. It was rejected and not used.`,
        });
      }
    }

    // --- Advisory only -------------------------------------------------------
    if (!isUserProvided && field.confidence <= lowConfidenceThreshold) {
      findings.push({
        code: 'low_confidence',
        severity: 'warning',
        path: field.path,
        label: field.label,
        message: `${field.label} was extracted with low confidence and is worth checking.`,
      });
    }

    audited.push({
      ...field,
      verified,
      quarantined,
      referenceText,
      rejectedReferenceText,
    });
  }

  return {
    fieldsExtracted: fields.length,
    fieldsVerified,
    fieldsQuarantined,
    hallucinatedRangesRejected,
    guardrailTriggered,
    aiCallCount,
    deterministicStageCount,
    findings,
    fields: audited,
  };
}

/**
 * One-line summary in plain language, for the Extraction Integrity panel.
 * Says only what the audit actually established.
 */
export function summarizeAudit(report: AuditReport): string {
  const parts = [
    `${String(report.fieldsVerified)} of ${String(report.fieldsExtracted)} fields verified against source.`,
  ];

  if (report.fieldsQuarantined > 0) {
    parts.push(`${String(report.fieldsQuarantined)} quarantined pending review.`);
  }

  if (report.hallucinatedRangesRejected > 0) {
    const plural = report.hallucinatedRangesRejected === 1 ? '' : 's';
    parts.push(
      `${String(report.hallucinatedRangesRejected)} reference range${plural} rejected as not present in the source.`,
    );
  }

  return parts.join(' ');
}
