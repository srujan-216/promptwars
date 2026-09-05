import 'server-only';

/**
 * Output guardrail (CLAUDE.md rule 5).
 *
 * Every model-generated sentence passes through here before a user sees it. The check
 * is a deterministic pattern scan, not a second model: a judge model would itself need
 * verifying, and would add a call and a failure mode to a job that regex does exactly.
 *
 * This blocks the language of diagnosis, prescription and dosage. It does not attempt to
 * assess whether a statement is medically *true* — that is not something a regex or a
 * model can settle, and the system's answer to it is to state only what the document
 * printed.
 */

export type GuardrailCode =
  | 'diagnosis_language'
  | 'prescription_language'
  | 'dosage_language'
  | 'treatment_change_language'
  | 'reassurance_language';

export interface GuardrailViolation {
  code: GuardrailCode;
  /** The matched text, so a reviewer can see exactly what tripped the rule. */
  match: string;
  explanation: string;
}

export interface GuardrailResult {
  passed: boolean;
  violations: GuardrailViolation[];
}

interface Rule {
  code: GuardrailCode;
  pattern: RegExp;
  explanation: string;
}

const RULES: readonly Rule[] = [
  {
    code: 'diagnosis_language',
    pattern: /\byou (?:have|are suffering from|are experiencing)\b|\bdiagnos(?:ed|is|e)\b|\byou (?:likely|probably) have\b|\bthis (?:indicates|means you have|confirms)\b/i,
    explanation: 'States or implies a diagnosis.',
  },
  {
    code: 'prescription_language',
    // Allows up to three words between the verb and the dose, so both "take 200 mg"
    // and "take ferrous sulphate 200 mg" are caught.
    pattern: /\b(?:take|start taking|you should take|begin)\s+(?:[\w-]+\s+){0,3}\d+\s*(?:mg|mcg|ml|g|iu|units)\b|\bprescrib(?:e|ed|ing)\b/i,
    explanation: 'Prescribes or names a specific medication regimen.',
  },
  {
    code: 'dosage_language',
    pattern: /\b\d+\s*(?:mg|mcg|iu|units)\b\s*(?:daily|twice|per day|a day|every)\b|\bdosage\b|\bdose of\b/i,
    explanation: 'Gives dosage guidance.',
  },
  {
    code: 'treatment_change_language',
    pattern: /\b(?:increase|decrease|reduce|adjust|stop|discontinue|continue)\s+(?:your|the)\s+(?:dose|dosage|medication|treatment|tablets?)\b|\bstop taking\b/i,
    explanation: 'Advises changing treatment.',
  },
  {
    code: 'reassurance_language',
    pattern: /\b(?:nothing to worry about|no cause for concern|you(?:'| a)?re (?:fine|healthy|okay|ok))\b/i,
    explanation: 'Offers clinical reassurance, which is a judgement we are not entitled to make.',
  },
];

/** Scan generated text. Pure and deterministic. */
export function checkGuardrail(text: string): GuardrailResult {
  const violations: GuardrailViolation[] = [];

  for (const rule of RULES) {
    const match = rule.pattern.exec(text);
    if (match !== null) {
      violations.push({
        code: rule.code,
        match: match[0],
        explanation: rule.explanation,
      });
    }
  }

  return { passed: violations.length === 0, violations };
}

export interface TemplateInput {
  totalResults: number;
  outsidePrintedRange: number;
  noReferenceInSource: number;
  fieldsVerified: number;
  fieldsQuarantined: number;
  rangesRejected: number;
}

/**
 * Deterministic fallback summary, used when generated text cannot be made to pass.
 *
 * It reports counts and nothing else. Every sentence is a statement about the document
 * or about our own processing — never about the patient. This is why the fallback is
 * safe to ship: it cannot fail the guardrail, because it makes no clinical claim.
 */
export function buildDeterministicSummary(input: TemplateInput): string {
  const {
    totalResults,
    outsidePrintedRange,
    noReferenceInSource,
    fieldsVerified,
    fieldsQuarantined,
    rangesRejected,
  } = input;

  const sentences: string[] = [
    `This report contains ${String(totalResults)} ${totalResults === 1 ? 'result' : 'results'}.`,
  ];

  if (outsidePrintedRange > 0) {
    sentences.push(
      `${String(outsidePrintedRange)} fell outside the reference range printed on the report itself.`,
    );
  }

  if (noReferenceInSource > 0) {
    sentences.push(
      `${String(noReferenceInSource)} had no reference range printed, so no comparison was made.`,
    );
  }

  sentences.push(
    `${String(fieldsVerified)} ${fieldsVerified === 1 ? 'field was' : 'fields were'} matched against the source text.`,
  );

  if (fieldsQuarantined > 0) {
    sentences.push(
      `${String(fieldsQuarantined)} could not be matched and ${fieldsQuarantined === 1 ? 'is' : 'are'} shown separately for review.`,
    );
  }

  if (rangesRejected > 0) {
    sentences.push(
      `${String(rangesRejected)} proposed reference ${rangesRejected === 1 ? 'range was' : 'ranges were'} rejected because ${rangesRejected === 1 ? 'it did' : 'they did'} not appear in the document.`,
    );
  }

  sentences.push('Discuss these results with a qualified clinician.');

  return sentences.join(' ');
}
