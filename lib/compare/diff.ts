/**
 * Deterministic comparison of two reports (CLAUDE.md rule 7).
 *
 * Matching is on canonical analyte name, and every delta is arithmetic on values that
 * were already extracted and verified. No model is called: "what changed between these
 * two numbers" is subtraction, and asking a model to subtract would add a failure mode
 * and an API call for no gain.
 *
 * `direction` describes the NUMBER only — it says a value rose or fell, never whether
 * that is good or bad. Interpreting a direction is clinical judgement.
 */

export type ChangeDirection = 'increased' | 'decreased' | 'unchanged';

export interface ComparableResult {
  /** Canonical name from lib/terminology/normalize.ts. */
  canonicalName: string;
  value: number;
  unit: string | null;
}

export interface ComparedRow {
  canonicalName: string;
  previous: number | null;
  current: number | null;
  unit: string | null;
  /** current − previous. Null when either side is missing, or units differ. */
  delta: number | null;
  /** Percentage change relative to the previous value. Null when not computable. */
  percentChange: number | null;
  direction: ChangeDirection | null;
  /** Present only in the previous report. */
  onlyInPrevious: boolean;
  /** Present only in the current report. */
  onlyInCurrent: boolean;
  /**
   * True when both reports carry the analyte but in different units. No delta is
   * computed — converting would be inventing data (consistent with `unit_mismatch`).
   */
  unitMismatch: boolean;
}

function nameKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function unitKey(unit: string | null): string | null {
  if (unit === null) return null;
  const trimmed = unit.trim().toLowerCase().replace(/\s+/g, '').replace(/µ|μ/g, 'u');
  return trimmed === '' ? null : trimmed;
}

/** Differences below this are rounding noise, not movement. */
const EPSILON = 1e-9;

function directionOf(delta: number): ChangeDirection {
  if (Math.abs(delta) < EPSILON) return 'unchanged';
  return delta > 0 ? 'increased' : 'decreased';
}

/**
 * Compare a previous report against a current one.
 *
 * Rows are returned sorted by canonical name so the output is stable and diffable.
 * Analytes present in only one report are included, flagged, and given a null delta —
 * dropping them would hide that something stopped or started being measured.
 */
export function compareReports(
  previous: readonly ComparableResult[],
  current: readonly ComparableResult[],
): ComparedRow[] {
  const previousByName = new Map<string, ComparableResult>();
  for (const result of previous) {
    previousByName.set(nameKey(result.canonicalName), result);
  }

  const currentByName = new Map<string, ComparableResult>();
  for (const result of current) {
    currentByName.set(nameKey(result.canonicalName), result);
  }

  const allKeys = [...new Set([...previousByName.keys(), ...currentByName.keys()])].sort();

  return allKeys.map((key): ComparedRow => {
    const before = previousByName.get(key) ?? null;
    const after = currentByName.get(key) ?? null;

    const canonicalName = after?.canonicalName ?? before?.canonicalName ?? key;
    const unit = after?.unit ?? before?.unit ?? null;

    if (before === null || after === null) {
      return {
        canonicalName,
        previous: before?.value ?? null,
        current: after?.value ?? null,
        unit,
        delta: null,
        percentChange: null,
        direction: null,
        onlyInPrevious: after === null,
        onlyInCurrent: before === null,
        unitMismatch: false,
      };
    }

    const beforeUnit = unitKey(before.unit);
    const afterUnit = unitKey(after.unit);
    const unitsDiffer = beforeUnit !== null && afterUnit !== null && beforeUnit !== afterUnit;

    if (unitsDiffer) {
      return {
        canonicalName,
        previous: before.value,
        current: after.value,
        unit,
        delta: null,
        percentChange: null,
        direction: null,
        onlyInPrevious: false,
        onlyInCurrent: false,
        unitMismatch: true,
      };
    }

    const delta = after.value - before.value;
    const percentChange =
      Math.abs(before.value) < EPSILON ? null : (delta / Math.abs(before.value)) * 100;

    return {
      canonicalName,
      previous: before.value,
      current: after.value,
      unit,
      delta,
      percentChange,
      direction: directionOf(delta),
      onlyInPrevious: false,
      onlyInCurrent: false,
      unitMismatch: false,
    };
  });
}
