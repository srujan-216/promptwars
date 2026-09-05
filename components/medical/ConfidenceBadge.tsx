import type { ReactElement } from 'react';

import { cn } from '@/lib/utils';

/**
 * The model's self-reported confidence, surfaced as icon + text (rule 10).
 *
 * Two things this badge must not be mistaken for, both stated in the tooltip:
 *
 * It is NOT a probability that the value is correct. It is the model's own claim about
 * itself, and a confidently-wrong extraction reports high confidence exactly as a
 * confidently-right one does.
 *
 * It is NOT verification. Verification is `sourceQuote` matched against the document, shown
 * separately by OriginBadge. A field can be high-confidence and quarantined, or
 * low-confidence and matched to source — the two are independent, and conflating them would
 * undo the point of the audit.
 *
 * It is useful for one thing: ordering what a human should check first.
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.85) return 'high';
  if (confidence > 0.5) return 'medium';
  return 'low';
}

const PRESENTATION: Record<
  ConfidenceLevel,
  { icon: string; label: string; className: string; description: string }
> = {
  high: {
    icon: '●●●',
    label: 'High confidence',
    className: 'border-slate-300 bg-slate-50 text-slate-700',
    description:
      'The model reported high confidence in reading this value. That is its claim about itself, not proof the value is correct.',
  },
  medium: {
    icon: '●●○',
    label: 'Medium confidence',
    className: 'border-slate-300 bg-slate-50 text-slate-700',
    description:
      'The model reported moderate confidence in reading this value. Worth a glance when reviewing.',
  },
  low: {
    icon: '●○○',
    label: 'Low confidence — check this',
    className: 'border-amber-300 bg-amber-50 text-amber-900',
    description:
      'The model reported low confidence in reading this value. It is flagged for review. This says nothing about whether the value matched the source document.',
  },
};

export function ConfidenceBadge({ confidence }: { confidence: number }): ReactElement {
  const level = confidenceLevel(confidence);
  const { icon, label, className, description } = PRESENTATION[level];
  const percent = Math.round(confidence * 100);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-xs font-medium',
        className,
      )}
      title={description}
    >
      <span aria-hidden="true" className="tracking-tighter">
        {icon}
      </span>
      <span>
        {label} ({percent}%)
      </span>
    </span>
  );
}

export { PRESENTATION as CONFIDENCE_PRESENTATION };
