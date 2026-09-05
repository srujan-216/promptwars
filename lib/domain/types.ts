/**
 * Core domain vocabulary. Everything downstream speaks in these types.
 */

/** Where a value came from. Never inferred — always set explicitly by the stage that produced it. */
export type FieldOrigin = 'user_provided' | 'ai_extracted' | 'ai_generated' | 'human_verified';

/**
 * The outcome of comparing a value against a reference range.
 *
 * Only `low` | `normal` | `high` are clinical positions, and only
 * `lib/ranges/evaluate.ts` — a pure function — may produce them (rule 2). The
 * remaining three are refusals to judge, and are first-class rather than errors:
 *
 * - `no_reference_in_source`  the document printed no range, so there is nothing to
 *                             compare against. Also the forced result when a model
 *                             emits a range that is not verbatim in the source (rule 3).
 * - `unparseable_range`       a range was present but could not be read as numbers.
 * - `unit_mismatch`           the value's unit differs from the range's unit, so the
 *                             comparison would be meaningless. We refuse, not convert.
 */
export type RangeStatus =
  | 'low'
  | 'normal'
  | 'high'
  | 'no_reference_in_source'
  | 'unparseable_range'
  | 'unit_mismatch';

/** Where in the source document a value was found. */
export interface FieldSource {
  page: number;
  quote: string;
  offset: number;
}

/**
 * A value plus the evidence for it.
 *
 * `verified` is set by `lib/verification/audit.ts` by string-matching `source.quote`
 * against the document text. It is never self-reported by the model: a field arrives
 * from extraction with `verified: false` and only becomes `true` if the quote is
 * actually found (rule 4).
 *
 * `confidence` is the model's own claim about itself and carries no authority. It may
 * inform review ordering; it must never gate correctness.
 */
export interface Provenanced<T> {
  value: T;
  origin: FieldOrigin;
  /** Model-reported, 0-1. Advisory only — never a substitute for verification. */
  confidence: number;
  /** Mechanically established by audit.ts. Never taken on trust. */
  verified: boolean;
  source?: FieldSource;
  editedBy?: string;
  editedAt?: Date;
  previousValue?: T;
}

/** A single laboratory measurement, after range analysis. */
export interface LabResult {
  /** Name exactly as printed in the source. */
  rawName: string;
  /** Canonical name from `lib/terminology/normalize.ts`, or `rawName` if unrecognised. */
  canonicalName: string;
  value: Provenanced<number>;
  unit: string | null;
  /** Reference range as printed, only ever populated from verbatim source text. */
  referenceText: string | null;
  refLow: number | null;
  refHigh: number | null;
  /** Unit the reference range itself was printed in, when stated. */
  refUnit: string | null;
  status: RangeStatus;
}

/**
 * Which tier of the summary chain produced the text a user is shown.
 *
 * Lives here rather than in `lib/server/ai/summary.ts` because client components need to
 * label the result, and a client component must never import from `lib/server/**`.
 */
export type SummarySource = 'generated' | 'regenerated' | 'deterministic_template';
