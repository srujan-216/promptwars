import type { ReactElement } from 'react';

import type { FieldOrigin } from '@/lib/domain/types';
import { cn } from '@/lib/utils';

/**
 * Where a value came from, on every field (CLAUDE.md rule 4).
 *
 * Icon + text + colour, same as StatusBadge. `verified` is shown separately from origin
 * because they answer different questions: origin is who produced the value, verified is
 * whether we found it in the document. An ai_extracted field that failed verification is
 * the interesting case, and it must not look like one that passed.
 */

const ORIGIN_PRESENTATION: Record<FieldOrigin, { label: string; icon: string; className: string }> =
  {
    user_provided: {
      label: 'You entered this',
      icon: '✎',
      className: 'bg-sky-50 text-sky-900 border-sky-200',
    },
    ai_extracted: {
      label: 'Read from document',
      icon: '⎘',
      className: 'bg-violet-50 text-violet-900 border-violet-200',
    },
    ai_generated: {
      label: 'AI-written',
      icon: '✦',
      className: 'bg-violet-50 text-violet-900 border-violet-200',
    },
    human_verified: {
      label: 'Checked by a person',
      icon: '✓',
      className: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    },
  };

export function OriginBadge({
  origin,
  verified,
}: {
  origin: FieldOrigin;
  /** Omit when verification does not apply, e.g. a value the user typed. */
  verified?: boolean;
}): ReactElement {
  const { label, icon, className } = ORIGIN_PRESENTATION[origin];

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium',
          className,
        )}
      >
        <span aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </span>

      {verified !== undefined && (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium',
            verified
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-300 bg-red-50 text-red-900',
          )}
        >
          <span aria-hidden="true">{verified ? '✓' : '!'}</span>
          <span>{verified ? 'Matched to source' : 'Not found in source'}</span>
        </span>
      )}
    </span>
  );
}

export { ORIGIN_PRESENTATION };
