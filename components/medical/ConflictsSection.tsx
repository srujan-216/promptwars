import type { ReactElement } from 'react';

import type { Conflict } from '@/lib/conflicts/detect';
import { cn } from '@/lib/utils';

/**
 * Detected contradictions.
 *
 * These are FLAGGED, never resolved. Deciding which of two disagreeing values is correct is
 * clinical judgement, so the section states what disagrees and stops. Severity is shown as
 * icon + text + colour, never colour alone.
 */

const SEVERITY: Record<Conflict['severity'], { icon: string; label: string; className: string }> = {
  critical: { icon: '!', label: 'Needs resolving', className: 'border-red-300 bg-red-50 text-red-900' },
  warning: { icon: '▲', label: 'Worth checking', className: 'border-amber-300 bg-amber-50 text-amber-900' },
};

export function ConflictsSection({ conflicts }: { conflicts: readonly Conflict[] }): ReactElement | null {
  if (conflicts.length === 0) return null;

  return (
    <section
      aria-labelledby="conflicts-heading"
      className="rounded-lg border border-slate-200 bg-white p-5"
    >
      <h2 id="conflicts-heading" className="text-lg font-semibold text-slate-900">
        Contradictions found ({conflicts.length})
      </h2>
      <p className="mt-2 max-w-prose text-sm text-slate-600">
        These are disagreements between what you entered and what the document says, or within
        the document itself. MedLens reports them; it does not decide which side is right.
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {conflicts.map((conflict, index) => {
          const { icon, label, className } = SEVERITY[conflict.severity];
          return (
            <li
              key={`${conflict.code}-${String(index)}`}
              className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-sm', className)}
            >
              <span aria-hidden="true" className="font-bold">
                {icon}
              </span>
              <span>
                <span className="font-medium">{label}: </span>
                {conflict.message}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
