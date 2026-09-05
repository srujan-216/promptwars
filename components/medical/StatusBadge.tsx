import type { ReactElement } from 'react';

import type { RangeStatus } from '@/lib/domain/types';
import { cn } from '@/lib/utils';

/**
 * Range status, shown as ICON + TEXT + COLOUR (CLAUDE.md rule 10).
 *
 * Never colour alone. Each status carries a distinct glyph and an explicit word, so the
 * badge is readable in greyscale, by a colour-blind reader, and by a screen reader.
 * The icon is aria-hidden because the adjacent text already names the status — announcing
 * both would read as "warning warning high".
 */

interface StatusPresentation {
  label: string;
  /** Distinct in shape, not just colour. */
  icon: string;
  className: string;
  /** Longer form for the title attribute and screen-reader description. */
  description: string;
}

const PRESENTATION: Record<RangeStatus, StatusPresentation> = {
  low: {
    label: 'Below printed range',
    icon: '▼',
    className: 'bg-amber-100 text-amber-900 border-amber-300',
    description: 'Below the reference range printed on the report.',
  },
  high: {
    label: 'Above printed range',
    icon: '▲',
    className: 'bg-amber-100 text-amber-900 border-amber-300',
    description: 'Above the reference range printed on the report.',
  },
  normal: {
    label: 'Within printed range',
    icon: '●',
    className: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    description: 'Within the reference range printed on the report.',
  },
  no_reference_in_source: {
    label: 'No range in source',
    icon: '—',
    className: 'bg-slate-100 text-slate-700 border-slate-300',
    description:
      'The document printed no reference range for this result, so no comparison was made.',
  },
  unparseable_range: {
    label: 'Range unreadable',
    icon: '?',
    className: 'bg-slate-100 text-slate-700 border-slate-300',
    description: 'A reference range was printed but could not be read as numbers.',
  },
  unit_mismatch: {
    label: 'Units differ',
    icon: '≠',
    className: 'bg-slate-100 text-slate-700 border-slate-300',
    description:
      'The value and its reference range use different units, so no comparison was made.',
  },
};

export function StatusBadge({ status }: { status: RangeStatus }): ReactElement {
  const { label, icon, className, description } = PRESENTATION[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        className,
      )}
      title={description}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </span>
  );
}

export { PRESENTATION as STATUS_PRESENTATION };
