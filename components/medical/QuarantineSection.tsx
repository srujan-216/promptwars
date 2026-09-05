'use client';

import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { ConfidenceBadge } from '@/components/medical/ConfidenceBadge';
import { OriginBadge } from '@/components/medical/OriginBadge';
import type { FieldOrigin } from '@/lib/domain/types';

/**
 * Quarantined fields (CLAUDE.md rule 4).
 *
 * These are values the model produced whose source quote could NOT be found in the
 * document. They are kept, not discarded — deleting them would hide that the model
 * claimed something — but they live in their own labelled region and are never mixed
 * into the verified record above.
 *
 * "Verify manually" flips origin to `human_verified` and retains previousValue, so the
 * record shows that a person vouched for this value and what it was before. It does not
 * assert the value is correct; it records who took responsibility for it.
 */

export interface QuarantinedItem {
  path: string;
  label: string;
  value: string;
  origin: FieldOrigin;
  /** The quote the model claimed but which was not found in the document. */
  claimedQuote: string | null;
  reason: string;
  /** Model-reported. Advisory only — it played no part in the quarantine decision. */
  confidence?: number;
}

interface VerifiedState {
  origin: FieldOrigin;
  previousValue: string;
  verifiedAt: Date;
}

export function QuarantineSection({
  items,
  verifierName = 'you',
}: {
  items: readonly QuarantinedItem[];
  verifierName?: string;
}): ReactElement | null {
  const [verified, setVerified] = useState<Record<string, VerifiedState>>({});
  const [announcement, setAnnouncement] = useState('');

  if (items.length === 0) return null;

  function verify(item: QuarantinedItem): void {
    setVerified((current) => ({
      ...current,
      [item.path]: {
        origin: 'human_verified',
        previousValue: item.value,
        verifiedAt: new Date(),
      },
    }));
    setAnnouncement(`${item.label} marked as checked by ${verifierName}.`);
  }

  const outstanding = items.filter((item) => verified[item.path] === undefined).length;

  return (
    <section
      aria-labelledby="quarantine-heading"
      className="rounded-lg border-2 border-red-300 bg-red-50/50 p-5"
    >
      <h2 id="quarantine-heading" className="text-lg font-semibold text-red-900">
        Quarantined — not verified against the document
      </h2>

      <p className="mt-2 max-w-prose text-sm text-red-900">
        {items.length === 1 ? 'This value was' : 'These values were'} produced by the AI, but the
        text {items.length === 1 ? 'it' : 'they'} quoted could not be found in the document you
        supplied. {items.length === 1 ? 'It is' : 'They are'} shown here, separately from the
        verified record, because we could not confirm {items.length === 1 ? 'it' : 'them'}.
      </p>

      {/* Announces the result of an action that changes content further up the list. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <p className="mt-3 text-sm font-medium text-red-900">
        {outstanding} of {items.length} still awaiting review.
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        {items.map((item) => {
          const state = verified[item.path];
          const isVerified = state !== undefined;

          return (
            <li
              key={item.path}
              id={item.path}
              className="rounded-md border border-red-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {item.label}: <span className="font-normal">{item.value}</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{item.reason}</p>

                  {item.claimedQuote !== null && (
                    <p className="mt-2 text-sm text-slate-600">
                      Quote the AI claimed:{' '}
                      <q className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">
                        {item.claimedQuote}
                      </q>
                    </p>
                  )}

                  <div className="mt-2">
                    <OriginBadge
                      origin={state?.origin ?? item.origin}
                      verified={isVerified ? true : false}
                    />
                    {item.confidence !== undefined && (
                      <span className="ml-2">
                        <ConfidenceBadge confidence={item.confidence} />
                      </span>
                    )}
                  </div>

                  {state !== undefined && (
                    <p className="mt-2 text-sm text-slate-600">
                      Marked as checked by {verifierName}. Previous value retained:{' '}
                      <span className="font-mono text-xs">{state.previousValue}</span>.
                    </p>
                  )}
                </div>

                {!isVerified && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      verify(item);
                    }}
                  >
                    Verify manually
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
