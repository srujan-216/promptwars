import type { ReactElement } from 'react';

import type { AuditFinding, AuditReport } from '@/lib/verification/audit';
import { cn } from '@/lib/utils';

/**
 * Extraction Integrity panel (the thesis, made visible).
 *
 * The verification result is not an internal detail — it is the product. This panel sits
 * at the top of the record and states, in plain language, what was checked and what was
 * thrown away. A user who reads only this should still learn that the system rejected
 * something the AI said.
 *
 * Each finding links to the field it concerns via a same-page anchor, so clicking it
 * moves focus to that field rather than merely scrolling — keyboard and screen-reader
 * users get the same affordance as mouse users.
 */

const SEVERITY_STYLES: Record<AuditFinding['severity'], { icon: string; className: string }> = {
  critical: { icon: '!', className: 'border-red-300 bg-red-50 text-red-900' },
  warning: { icon: '▲', className: 'border-amber-300 bg-amber-50 text-amber-900' },
  info: { icon: 'i', className: 'border-slate-300 bg-slate-50 text-slate-700' },
};

function Stat({
  value,
  label,
  emphasis = false,
}: {
  value: number;
  label: string;
  emphasis?: boolean;
}): ReactElement {
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2',
        emphasis && value > 0
          ? 'border-red-300 bg-red-50 text-red-900'
          : 'border-slate-200 bg-white text-slate-900',
      )}
    >
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-slate-600">{label}</p>
    </div>
  );
}

export function IntegrityPanel({ audit }: { audit: AuditReport }): ReactElement {
  const {
    fieldsExtracted,
    fieldsVerified,
    fieldsQuarantined,
    hallucinatedRangesRejected,
    guardrailTriggered,
    aiCallCount,
    deterministicStageCount,
    findings,
  } = audit;

  return (
    <section
      aria-labelledby="integrity-heading"
      className="rounded-lg border border-slate-300 bg-slate-50 p-5"
    >
      <h2 id="integrity-heading" className="text-lg font-semibold text-slate-900">
        Extraction integrity
      </h2>

      <p className="mt-2 max-w-prose text-slate-700">
        {fieldsVerified} of {fieldsExtracted} fields were matched against the text of your
        document.
        {fieldsQuarantined > 0 && ` ${String(fieldsQuarantined)} could not be matched and ${fieldsQuarantined === 1 ? 'is' : 'are'} quarantined below, pending your review.`}
        {hallucinatedRangesRejected > 0 &&
          ` ${String(hallucinatedRangesRejected)} reference ${hallucinatedRangesRejected === 1 ? 'range was' : 'ranges were'} rejected because ${hallucinatedRangesRejected === 1 ? 'it was' : 'they were'} not printed in the source.`}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={fieldsVerified} label="Verified against source" />
        <Stat value={fieldsQuarantined} label="Quarantined" emphasis />
        <Stat value={hallucinatedRangesRejected} label="Ranges rejected" emphasis />
        <Stat value={aiCallCount} label="AI calls made" />
      </div>

      <p className="mt-3 text-sm text-slate-600">
        {deterministicStageCount} of {deterministicStageCount + (aiCallCount > 0 ? 1 : 0)} pipeline
        stages ran as deterministic code with no AI involvement.
        {guardrailTriggered
          ? ' The safety guardrail rejected at least one generated summary.'
          : ' The safety guardrail passed the generated summary.'}
      </p>

      {findings.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold text-slate-900">
            What we found ({findings.length})
          </h3>
          <ul className="mt-2 flex flex-col gap-2">
            {findings.map((finding, index) => {
              const { icon, className } = SEVERITY_STYLES[finding.severity];
              return (
                <li
                  key={`${finding.code}-${finding.path}-${String(index)}`}
                  className={cn('rounded-md border px-3 py-2 text-sm', className)}
                >
                  <a
                    href={`#${finding.path}`}
                    className="flex items-start gap-2 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                  >
                    <span aria-hidden="true" className="font-bold">
                      {icon}
                    </span>
                    <span>
                      <span className="sr-only">{finding.severity}: </span>
                      {finding.message}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
