import type { ReactElement } from 'react';

import { OriginBadge } from '@/components/medical/OriginBadge';
import type { SummarySource } from '@/lib/domain/types';

/**
 * The AI-written summary (CR-6).
 *
 * Badged `ai_generated` and visually separated from the record, because this is the one
 * piece of prose on the page a model wrote. Everything else is transcribed or computed.
 *
 * When the guardrail fired, we SAY SO. A rejected summary is the safety mechanism working,
 * and hiding it would mean the one time the system caught itself is the one time the user
 * is not told.
 */

export interface SummaryView {
  text: string;
  source: SummarySource;
  guardrailTriggered: boolean;
  rejectedAttemptCount: number;
}

const SOURCE_NOTE: Record<SummarySource, string> = {
  generated: 'Written by the AI from the verified figures above, and checked before display.',
  regenerated:
    'The first attempt used language this system does not permit. It was rejected and regenerated under a stricter instruction.',
  deterministic_template:
    'Both AI attempts used language this system does not permit, so both were rejected. The text below was assembled by deterministic code from the counts above — it makes no clinical claim.',
};

export function SummarySection({ summary }: { summary: SummaryView | null }): ReactElement {
  if (summary === null) {
    return (
      <section
        aria-labelledby="summary-heading"
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <h2 id="summary-heading" className="text-lg font-semibold text-slate-900">
          Summary
        </h2>
        <p className="mt-2 max-w-prose text-sm text-slate-700">
          No summary was generated. Summaries require a configured <code>GEMINI_API_KEY</code>;
          without one the system does not call a model, and it will not fabricate prose to fill
          the gap.
        </p>
      </section>
    );
  }

  const isTemplate = summary.source === 'deterministic_template';

  return (
    <section
      aria-labelledby="summary-heading"
      className="rounded-lg border border-slate-200 bg-white p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="summary-heading" className="text-lg font-semibold text-slate-900">
          Summary
        </h2>
        {/*
          The deterministic template is not ai_generated and not user_provided — no
          FieldOrigin describes "assembled by pure code", so it gets its own label rather
          than being squeezed into a value that would misstate where the text came from.
        */}
        {isTemplate ? (
          <span className="inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-800">
            <span aria-hidden="true">⚙</span>
            <span>Written by deterministic code</span>
          </span>
        ) : (
          <OriginBadge origin="ai_generated" />
        )}
      </div>

      {summary.guardrailTriggered && (
        <p
          className={`mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
            isTemplate
              ? 'border-red-300 bg-red-50 text-red-900'
              : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          <span aria-hidden="true" className="font-bold">
            !
          </span>
          <span>
            <strong>Safety guardrail fired.</strong>{' '}
            {summary.rejectedAttemptCount === 1
              ? 'One generated summary was rejected before display.'
              : `${String(summary.rejectedAttemptCount)} generated summaries were rejected before display.`}{' '}
            {SOURCE_NOTE[summary.source]}
          </span>
        </p>
      )}

      <p className="mt-3 max-w-prose text-slate-800">{summary.text}</p>

      {!summary.guardrailTriggered && (
        <p className="mt-3 text-sm text-slate-600">{SOURCE_NOTE[summary.source]}</p>
      )}
    </section>
  );
}
