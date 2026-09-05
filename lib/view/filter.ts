import type { LabResult, RangeStatus } from '@/lib/domain/types';
import { toLookupKey } from '@/lib/terminology/normalize';

/**
 * Filtering and search over lab results. Pure, so it is testable without a DOM.
 *
 * Search runs over the CANONICAL name as well as the printed one, which is the whole reason
 * `lib/terminology/normalize.ts` exists. Typing "Hb" finds a row the report printed as
 * "Haemoglobin", because both resolve to the same canonical name. Matching the raw string
 * alone would make the normalization invisible to the user.
 */

export type StatusFilter = 'all' | RangeStatus;

export interface FilterOptions {
  query: string;
  status: StatusFilter;
}

/** Fold for comparison: lowercase, punctuation and whitespace removed. */
function searchKey(value: string): string {
  return toLookupKey(value);
}

/**
 * True when the row matches the query.
 *
 * A row matches if the query appears in its canonical name OR the name as printed. Both are
 * checked because a user may search for either — what they typed, or what they saw.
 */
export function matchesQuery(lab: LabResult, query: string): boolean {
  const needle = searchKey(query);
  if (needle === '') return true;

  return (
    searchKey(lab.canonicalName).includes(needle) || searchKey(lab.rawName).includes(needle)
  );
}

export function matchesStatus(lab: LabResult, status: StatusFilter): boolean {
  return status === 'all' || lab.status === status;
}

export function filterLabs(
  labs: readonly LabResult[],
  { query, status }: FilterOptions,
): LabResult[] {
  return labs.filter((lab) => matchesQuery(lab, query) && matchesStatus(lab, status));
}

/** Statuses actually present in the data, so the filter never offers an empty option. */
export function availableStatuses(labs: readonly LabResult[]): RangeStatus[] {
  return [...new Set(labs.map((lab) => lab.status))];
}

/** Plain-language count for the live region. */
export function describeResultCount(shown: number, total: number): string {
  if (shown === total) {
    return `Showing all ${String(total)} ${total === 1 ? 'result' : 'results'}.`;
  }
  return `Showing ${String(shown)} of ${String(total)} results.`;
}
