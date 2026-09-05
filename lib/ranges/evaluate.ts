import type { RangeStatus } from '@/lib/domain/types';

/**
 * Range evaluation. Pure, deterministic, and the ONLY place in the system permitted
 * to decide that a value is low, normal or high (CLAUDE.md rule 2).
 *
 * Two principles govern every branch below:
 *
 * 1. No range is ever invented. If the source did not print one, the answer is
 *    `no_reference_in_source` — not a range recalled from general knowledge.
 * 2. When a comparison would be meaningless, we refuse rather than guess. A unit
 *    mismatch returns `unit_mismatch`; unreadable text returns `unparseable_range`.
 */

export interface EvaluateInput {
  value: number;
  /** Unit the value was reported in, as printed. `null` when the source omitted it. */
  unit?: string | null;
  /** Reference range exactly as printed in the source. `null`/absent when none was printed. */
  referenceText?: string | null;
  /** Unit the reference range was printed in, when it differs from `unit`. */
  refUnit?: string | null;
}

export interface EvaluateResult {
  status: RangeStatus;
  /** Parsed lower bound, when one was readable. */
  refLow: number | null;
  /** Parsed upper bound, when one was readable. */
  refHigh: number | null;
}

/** A parsed reference range. Bounds are inclusive unless the source used < or >. */
interface ParsedRange {
  low: number | null;
  high: number | null;
  /** True when the source wrote "<0.5", meaning normal is strictly below 0.5. */
  exclusiveHigh: boolean;
  /** True when the source wrote ">200", meaning normal is strictly above 200. */
  exclusiveLow: boolean;
}

/**
 * Unit comparison is intentionally crude: case-insensitive, whitespace-stripped,
 * micro sign folded. It does NOT convert between units — conversion is out of scope,
 * so anything that does not match textually is reported as `unit_mismatch` and the
 * comparison is refused.
 */
function canonicalUnit(unit: string): string {
  return unit
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/µ|μ/g, 'u'); // µ (micro sign) and μ (Greek mu) → u
}

function unitsAgree(valueUnit: string | null | undefined, refUnit: string | null | undefined): boolean {
  // A unit stated on only one side is not evidence of disagreement.
  if (valueUnit == null || refUnit == null) return true;
  if (valueUnit.trim() === '' || refUnit.trim() === '') return true;
  return canonicalUnit(valueUnit) === canonicalUnit(refUnit);
}

/** Matches a number, including negatives and decimals with a leading dot. */
const NUMBER = String.raw`-?\d*\.?\d+`;

// Anchored at the start only, so a trailing unit ("13 - 17 g/dL") is simply ignored
// rather than having to be stripped beforehand.
const LESS_THAN = new RegExp(String.raw`^<\s*(${NUMBER})`);
const GREATER_THAN = new RegExp(String.raw`^>\s*(${NUMBER})`);
// Separator may be a hyphen, en-dash, em-dash, or the word "to".
const BOUNDED = new RegExp(String.raw`^(${NUMBER})\s*(?:[-–—]|\bto\b)\s*(${NUMBER})`);

/**
 * Parse a printed reference range. Returns null when the text is present but
 * unreadable, which the caller reports as `unparseable_range`.
 *
 * Deliberately narrow: it understands the forms real reports actually print, and
 * refuses everything else rather than guessing at an interpretation.
 */
export function parseReferenceRange(referenceText: string): ParsedRange | null {
  // Normalise whitespace and drop wrapping brackets, e.g. "(13 - 17)". A trailing unit
  // needs no special handling: the patterns below are anchored at the start only.
  const candidate = referenceText
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[[\]()]/g, '')
    .trim();

  const lessThan = LESS_THAN.exec(candidate);
  if (lessThan?.[1] !== undefined) {
    const high = Number(lessThan[1]);
    return Number.isFinite(high)
      ? { low: null, high, exclusiveHigh: true, exclusiveLow: false }
      : null;
  }

  const greaterThan = GREATER_THAN.exec(candidate);
  if (greaterThan?.[1] !== undefined) {
    const low = Number(greaterThan[1]);
    return Number.isFinite(low)
      ? { low, high: null, exclusiveHigh: false, exclusiveLow: true }
      : null;
  }

  const bounded = BOUNDED.exec(candidate);
  if (bounded?.[1] !== undefined && bounded[2] !== undefined) {
    const low = Number(bounded[1]);
    const high = Number(bounded[2]);
    if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
    // An inverted range is a parse failure, not something to silently reorder.
    if (low > high) return null;
    return { low, high, exclusiveHigh: false, exclusiveLow: false };
  }

  return null;
}

/**
 * Decide a value's position relative to its printed reference range.
 *
 * Bounds are INCLUSIVE: a value exactly equal to refLow or refHigh is `normal`.
 * The exclusive forms `<x` and `>x` are the exception, and are honoured as written.
 */
export function evaluateRange(input: EvaluateInput): EvaluateResult {
  const { value, unit = null, referenceText = null, refUnit = null } = input;

  if (!Number.isFinite(value)) {
    return { status: 'unparseable_range', refLow: null, refHigh: null };
  }

  // Rule 2: absent means absent. We never supply a range from memory.
  if (referenceText == null || referenceText.trim() === '') {
    return { status: 'no_reference_in_source', refLow: null, refHigh: null };
  }

  const parsed = parseReferenceRange(referenceText);
  if (parsed === null) {
    return { status: 'unparseable_range', refLow: null, refHigh: null };
  }

  // Checked after parsing so the caller still learns the bounds we read, but before
  // any comparison: comparing across units would produce a confidently wrong answer.
  if (!unitsAgree(unit, refUnit)) {
    return { status: 'unit_mismatch', refLow: parsed.low, refHigh: parsed.high };
  }

  const { low, high, exclusiveHigh, exclusiveLow } = parsed;

  if (high !== null && (exclusiveHigh ? value >= high : value > high)) {
    return { status: 'high', refLow: low, refHigh: high };
  }

  if (low !== null && (exclusiveLow ? value <= low : value < low)) {
    return { status: 'low', refLow: low, refHigh: high };
  }

  return { status: 'normal', refLow: low, refHigh: high };
}
