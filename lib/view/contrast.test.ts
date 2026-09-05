import { describe, expect, it } from 'vitest';

import {
  AA_NORMAL_TEXT,
  contrastRatio,
  PALETTE,
  ratioFor,
  relativeLuminance,
  TEXT_PAIRS,
} from './contrast';

describe('contrastRatio — the formula itself', () => {
  it('gives 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('gives 1:1 for a colour against itself', () => {
    expect(contrastRatio('#4a90d9', '#4a90d9')).toBeCloseTo(1, 5);
  });

  it('is symmetric — order does not change the ratio', () => {
    expect(contrastRatio('#0f172a', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#0f172a'),
      10,
    );
  });

  it('matches the published luminance of white and black', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
  });

  it('agrees with a known reference value', () => {
    // #767676 on white is the canonical 4.54:1 example — the lightest grey that passes AA.
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 1);
  });
});

describe('every text pair in the interface meets WCAG AA', () => {
  /**
   * This is the check axe cannot run here: color-contrast needs a browser to sample
   * rendered pixels, and jsdom has no canvas. Rather than disable the most commonly failed
   * success criterion and call accessibility done, the pairs are enumerated and asserted.
   */
  it.each(TEXT_PAIRS.map((pair) => [pair.label, pair] as const))(
    '%s clears 4.5:1',
    (_label, pair) => {
      expect(ratioFor(pair)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    },
  );

  it('has no pair sitting marginally on the threshold', () => {
    // A pair at exactly 4.50 would fail on any rounding difference in a real browser.
    for (const pair of TEXT_PAIRS) {
      expect(ratioFor(pair)).toBeGreaterThan(4.55);
    }
  });

  it('covers every component that renders coloured text', () => {
    const labels = TEXT_PAIRS.map((p) => p.label).join(' ');

    for (const component of [
      'AdviceBanner',
      'StatusBadge',
      'OriginBadge',
      'QuarantineSection',
      'ConfidenceBadge',
      'IntegrityPanel',
      'SourceView',
    ]) {
      expect(labels).toContain(component);
    }
  });

  it('uses only palette colours that are defined', () => {
    for (const pair of TEXT_PAIRS) {
      expect(PALETTE[pair.foreground]).toMatch(/^#[0-9a-f]{6}$/);
      expect(PALETTE[pair.background]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
