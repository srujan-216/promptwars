/**
 * WCAG 2.1 contrast ratios, computed from the palette.
 *
 * This exists to close a real gap. axe-core's `color-contrast` rule needs a browser to
 * sample rendered pixels; jsdom has no canvas, so the rule is disabled in every axe run
 * here. Disabling the most commonly failed success criterion and calling accessibility
 * done would be exactly the kind of overclaim this project avoids.
 *
 * So contrast is checked a different way: the colour pairs the interface actually uses are
 * listed explicitly and their ratios computed from the hex values, using the WCAG relative
 * luminance formula. `contrast.test.ts` asserts every pair clears AA.
 *
 * WHAT THIS DOES NOT COVER, since the point is not to swap one overclaim for another:
 * it verifies the pairs listed below, not whatever a browser finally composites. A colour
 * used in a combination nobody added here is unverified, and text over a gradient or image
 * is out of scope entirely. It is a check on the palette, not on the rendering.
 */

/** Tailwind v4 default palette values, as used in the components. */
export const PALETTE = {
  white: '#ffffff',
  'slate-50': '#f8fafc',
  'slate-100': '#f1f5f9',
  'slate-500': '#64748b',
  'slate-600': '#475569',
  'slate-700': '#334155',
  'slate-900': '#0f172a',
  'amber-50': '#fffbeb',
  'amber-100': '#fef3c7',
  'amber-300': '#fcd34d',
  'amber-900': '#78350f',
  'amber-950': '#451a03',
  'emerald-50': '#ecfdf5',
  'emerald-100': '#d1fae5',
  'emerald-900': '#064e3b',
  'red-50': '#fef2f2',
  'red-800': '#991b1b',
  'red-900': '#7f1d1d',
  'violet-50': '#f5f3ff',
  'violet-900': '#4c1d95',
  'sky-50': '#f0f9ff',
  'sky-900': '#0c4a6e',
} as const;

export type PaletteColor = keyof typeof PALETTE;

/** WCAG relative luminance. */
export function relativeLuminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio, 1:1 to 21:1. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ColorPair {
  /** Where in the interface this combination appears. */
  label: string;
  foreground: PaletteColor;
  background: PaletteColor;
}

/**
 * Every foreground/background combination the interface uses for text.
 *
 * Adding a colour combination to a component without adding it here leaves it unverified —
 * which is a real limitation of this approach and is why the list names the component.
 */
export const TEXT_PAIRS: readonly ColorPair[] = [
  { label: 'Body text', foreground: 'slate-900', background: 'slate-50' },
  { label: 'Secondary text', foreground: 'slate-700', background: 'slate-50' },
  { label: 'Muted text on white', foreground: 'slate-600', background: 'white' },
  { label: 'Placeholder and hint text', foreground: 'slate-500', background: 'white' },
  { label: 'Card text on white', foreground: 'slate-900', background: 'white' },
  { label: 'AdviceBanner', foreground: 'amber-950', background: 'amber-100' },
  { label: 'StatusBadge: below/above printed range', foreground: 'amber-900', background: 'amber-100' },
  { label: 'StatusBadge: within printed range', foreground: 'emerald-900', background: 'emerald-100' },
  { label: 'StatusBadge: no range / unreadable / units differ', foreground: 'slate-700', background: 'slate-100' },
  { label: 'OriginBadge: read from document', foreground: 'violet-900', background: 'violet-50' },
  { label: 'OriginBadge: you entered this', foreground: 'sky-900', background: 'sky-50' },
  { label: 'OriginBadge: checked by a person', foreground: 'emerald-900', background: 'emerald-50' },
  { label: 'OriginBadge: matched to source', foreground: 'emerald-900', background: 'emerald-50' },
  { label: 'OriginBadge: not found in source', foreground: 'red-900', background: 'red-50' },
  { label: 'QuarantineSection heading', foreground: 'red-900', background: 'red-50' },
  { label: 'Form error text', foreground: 'red-800', background: 'white' },
  { label: 'ConfidenceBadge: high and medium', foreground: 'slate-700', background: 'slate-50' },
  { label: 'ConfidenceBadge: low', foreground: 'amber-900', background: 'amber-50' },
  { label: 'IntegrityPanel finding: critical', foreground: 'red-900', background: 'red-50' },
  { label: 'IntegrityPanel finding: warning', foreground: 'amber-900', background: 'amber-50' },
  { label: 'Primary button', foreground: 'slate-50', background: 'slate-900' },
  { label: 'Outline button', foreground: 'slate-900', background: 'white' },
  { label: 'Skip link', foreground: 'slate-50', background: 'slate-900' },
  { label: 'SourceView highlight', foreground: 'slate-900', background: 'amber-300' },
];

/** WCAG 2.1 AA for normal-size text. */
export const AA_NORMAL_TEXT = 4.5;

export function ratioFor(pair: ColorPair): number {
  return contrastRatio(PALETTE[pair.foreground], PALETTE[pair.background]);
}
