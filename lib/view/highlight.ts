/**
 * Locating a source quote inside the document, for the side-by-side view.
 *
 * The matching latitude here is deliberately the SAME as `normalizeForMatch` in
 * `lib/verification/audit.ts`: runs of whitespace are flexible, and en/em dashes are
 * interchangeable with hyphens. Nothing else.
 *
 * That equivalence matters. If highlighting were more forgiving than verification, a field
 * could be shown highlighted in the source while having been quarantined for not matching —
 * the interface would contradict the audit. If it were stricter, a verified field could fail
 * to highlight and look unverified. Either way the user would be misled, so both use one
 * rule.
 */

export interface QuoteRange {
  start: number;
  end: number;
}

/** Escape a string for literal use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a pattern matching `quote` with the same tolerance the verifier uses:
 * any whitespace run matches any whitespace run, and dash variants are equivalent.
 */
function toTolerantPattern(quote: string): RegExp {
  const escaped = escapeRegExp(quote.trim())
    // Whitespace in the quote matches any whitespace run in the source.
    .replace(/\s+/g, '\\s+')
    // Dash variants are interchangeable. The escaped forms are plain characters.
    .replace(/[–—-]/g, '[-–—]');

  return new RegExp(escaped);
}

/**
 * Find where a quote occurs in the source, or null when it does not.
 *
 * Returns the FIRST occurrence. A quote appearing twice is not ambiguous for our purpose:
 * highlighting either instance shows the user that the text is genuinely present.
 */
export function findQuoteRange(source: string, quote: string | null): QuoteRange | null {
  if (quote === null) return null;

  const trimmed = quote.trim();
  if (trimmed === '') return null;

  // Exact match first — cheapest, and the common case.
  const exact = source.indexOf(trimmed);
  if (exact !== -1) {
    return { start: exact, end: exact + trimmed.length };
  }

  const match = toTolerantPattern(trimmed).exec(source);
  if (match === null) return null;

  return { start: match.index, end: match.index + match[0].length };
}

export interface HighlightSegments {
  before: string;
  match: string;
  after: string;
}

/**
 * Split the source around a quote, for rendering `before<mark>match</mark>after`.
 * Returns null when the quote is not present — which is exactly what a quarantined field
 * looks like, and the caller must say so rather than silently rendering the whole document.
 */
export function splitAroundQuote(source: string, quote: string | null): HighlightSegments | null {
  const range = findQuoteRange(source, quote);
  if (range === null) return null;

  return {
    before: source.slice(0, range.start),
    match: source.slice(range.start, range.end),
    after: source.slice(range.end),
  };
}
