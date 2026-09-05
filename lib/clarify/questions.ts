/**
 * Deterministic clarification questions (CLAUDE.md rule 7).
 *
 * These come from explicit gap rules, not from a model. Each rule looks for a piece of
 * information that is missing or unreliable and asks for it.
 *
 * Everything produced here is a QUESTION. Never advice, never a suggested answer, never
 * an implication about what a symptom might mean. "How long have you had the headache?"
 * is in scope; "Headaches lasting over a week should be checked" is not.
 */

export type QuestionCode =
  | 'symptom_duration_missing'
  | 'age_missing'
  | 'sex_missing'
  | 'low_confidence_field'
  | 'report_date_missing';

export interface ClarificationQuestion {
  code: QuestionCode;
  /** The question, phrased for the patient. */
  question: string;
  /** Why we are asking, in plain language. */
  reason: string;
  /** Field path this would fill in, so an answer can be routed back. */
  path: string;
}

export interface SymptomInput {
  path: string;
  name: string;
  /** Free-text duration, e.g. "3 days". Null when the patient did not say. */
  duration: string | null;
}

export interface LowConfidenceField {
  path: string;
  label: string;
  confidence: number;
}

export interface ClarifyInput {
  symptoms?: readonly SymptomInput[];
  age?: number | null;
  sex?: string | null;
  reportDate?: string | null;
  /** Whether a document was supplied at all — no document means no report date to ask for. */
  hasDocument?: boolean;
  lowConfidenceFields?: readonly LowConfidenceField[];
  /** Confidence at or below this is worth confirming. */
  lowConfidenceThreshold?: number;
  /** Upper bound on questions returned, so the UI is never flooded. */
  maxQuestions?: number;
}

const MAX_QUESTIONS_DEFAULT = 5;

/**
 * Build the clarification set, highest-value question first, capped at `maxQuestions`.
 *
 * Ordering is fixed rather than scored, so the same input always produces the same
 * questions in the same order.
 */
export function buildClarificationQuestions(
  input: ClarifyInput,
): ClarificationQuestion[] {
  const {
    symptoms = [],
    age = null,
    sex = null,
    reportDate = null,
    hasDocument = false,
    lowConfidenceFields = [],
    lowConfidenceThreshold = 0.5,
    maxQuestions = MAX_QUESTIONS_DEFAULT,
  } = input;

  const questions: ClarificationQuestion[] = [];

  // Symptoms without a duration — the single most common intake gap.
  for (const symptom of symptoms) {
    if (symptom.duration !== null && symptom.duration.trim() !== '') continue;
    questions.push({
      code: 'symptom_duration_missing',
      question: `How long have you been experiencing ${symptom.name.toLowerCase()}?`,
      reason: 'Duration was not recorded for this symptom.',
      path: symptom.path,
    });
  }

  if (age === null) {
    questions.push({
      code: 'age_missing',
      question: 'What is your age?',
      reason: 'Age was not provided and is not present in the uploaded document.',
      path: 'patient.age',
    });
  }

  if (sex === null || sex.trim() === '') {
    questions.push({
      code: 'sex_missing',
      question: 'What sex was recorded on your lab report?',
      // Stated as a data-collection reason only. We do not apply sex-specific ranges
      // ourselves — that would be inferring a range we were not given (rule 2).
      reason:
        'Many lab reports print different reference ranges by sex. Knowing which was used helps you read the printed range correctly.',
      path: 'patient.sex',
    });
  }

  if (hasDocument && (reportDate === null || reportDate.trim() === '')) {
    questions.push({
      code: 'report_date_missing',
      question: 'What date was this report issued?',
      reason: 'No report date could be found in the document.',
      path: 'report.date',
    });
  }

  for (const field of lowConfidenceFields) {
    if (field.confidence > lowConfidenceThreshold) continue;
    questions.push({
      code: 'low_confidence_field',
      question: `Can you confirm the value recorded for ${field.label}?`,
      reason: 'This value was read from the document with low confidence.',
      path: field.path,
    });
  }

  return questions.slice(0, Math.max(0, maxQuestions));
}
