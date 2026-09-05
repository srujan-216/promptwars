import { describe, expect, it } from 'vitest';

import { quoteAppearsInSource } from '@/lib/verification/audit';
import { findQuoteRange, splitAroundQuote } from './highlight';

const SOURCE = `CITY DIAGNOSTIC LABORATORY
Hemoglobin        11.2 g/dL     13.0 - 17.0 g/dL
Ferritin          18 ng/mL`;

describe('findQuoteRange', () => {
  it('finds an exact quote', () => {
    const range = findQuoteRange(SOURCE, 'Ferritin          18 ng/mL');

    expect(range).not.toBeNull();
    expect(SOURCE.slice(range?.start, range?.end)).toBe('Ferritin          18 ng/mL');
  });

  it('finds a quote whose whitespace differs from the source', () => {
    const range = findQuoteRange(SOURCE, 'Hemoglobin 11.2 g/dL');

    expect(range).not.toBeNull();
    expect(SOURCE.slice(range?.start, range?.end)).toContain('Hemoglobin');
  });

  it('finds a quote using an en-dash where the source used a hyphen', () => {
    expect(findQuoteRange(SOURCE, '13.0 – 17.0 g/dL')).not.toBeNull();
  });

  it('returns null for text that is not present', () => {
    expect(findQuoteRange(SOURCE, 'Vitamin D 22 ng/mL')).toBeNull();
  });

  it('returns null for a null quote', () => {
    expect(findQuoteRange(SOURCE, null)).toBeNull();
  });

  it('returns null for a blank quote', () => {
    expect(findQuoteRange(SOURCE, '   ')).toBeNull();
  });

  it('does not treat a regex metacharacter as a pattern', () => {
    // A quote containing "." must not match any character.
    expect(findQuoteRange('abc', 'a.c')).toBeNull();
  });
});

describe('splitAroundQuote', () => {
  it('splits the source into before, match and after', () => {
    const segments = splitAroundQuote(SOURCE, 'Ferritin          18 ng/mL');

    expect(segments).not.toBeNull();
    expect(`${segments?.before ?? ''}${segments?.match ?? ''}${segments?.after ?? ''}`).toBe(
      SOURCE,
    );
  });

  it('returns null when the quote is absent, rather than rendering the whole document', () => {
    expect(splitAroundQuote(SOURCE, 'Vitamin D 22 ng/mL')).toBeNull();
  });
});

describe('highlighting agrees with verification', () => {
  /**
   * The two must never disagree. A field the verifier accepted must be highlightable, and a
   * field it rejected must not be — otherwise the interface would contradict the audit.
   */
  it.each([
    'Ferritin          18 ng/mL',
    'Hemoglobin 11.2 g/dL',
    '13.0 – 17.0 g/dL',
    'Vitamin D 22 ng/mL',
    'not in the document at all',
  ])('agrees for %j', (quote) => {
    const verifierAccepts = quoteAppearsInSource(SOURCE, quote);
    const canHighlight = findQuoteRange(SOURCE, quote) !== null;

    expect(canHighlight).toBe(verifierAccepts);
  });
});
