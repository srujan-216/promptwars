'use client';

import { useState, type ReactElement } from 'react';

import { LabFilter } from '@/components/medical/LabFilter';
import { OriginBadge } from '@/components/medical/OriginBadge';
import { StatusBadge } from '@/components/medical/StatusBadge';
import type { LabResult } from '@/lib/domain/types';
import { filterLabs, type StatusFilter } from '@/lib/view/filter';

/**
 * Laboratory results, with search and status filtering.
 *
 * The filter is view state only. It never removes a result from the record — filtering to
 * nothing shows "No results match", not an empty record, so a filtered view can never be
 * mistaken for a report that contained nothing.
 */
export function LabResultsSection({ labs }: { labs: readonly LabResult[] }): ReactElement {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const shown = filterLabs(labs, { query, status });

  return (
    <section
      aria-labelledby="labs-heading"
      className="rounded-lg border border-slate-200 bg-white p-5"
    >
      <h3 id="labs-heading" className="text-base font-semibold text-slate-900">
        Laboratory results
      </h3>

      {labs.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">
          No laboratory results were found in the document.
        </p>
      ) : (
        <>
          <div className="mt-3">
            <LabFilter
              labs={labs}
              query={query}
              status={status}
              shownCount={shown.length}
              onQueryChange={setQuery}
              onStatusChange={setStatus}
            />
          </div>

          {shown.length === 0 ? (
            <p className="mt-3 text-sm text-slate-700">
              No results match this search. {labs.length}{' '}
              {labs.length === 1 ? 'result is' : 'results are'} still in the record — clear the
              filter to see {labs.length === 1 ? 'it' : 'them'}.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Laboratory results, with the reference range printed on the source report and
                  where each value came from.
                </caption>
                <thead>
                  <tr className="border-b border-slate-200">
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      Test
                    </th>
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      Result
                    </th>
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      Range printed on report
                    </th>
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      Status
                    </th>
                    <th scope="col" className="py-2 font-semibold">
                      Source
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((lab, index) => (
                    <tr
                      key={`${lab.canonicalName}-${String(index)}`}
                      id={`labs.${String(index)}`}
                      className="border-b border-slate-100 align-top"
                    >
                      <th scope="row" className="py-3 pr-4 font-medium text-slate-900">
                        {lab.canonicalName}
                        {lab.canonicalName !== lab.rawName && (
                          <span className="block text-xs font-normal text-slate-500">
                            printed as &ldquo;{lab.rawName}&rdquo;
                          </span>
                        )}
                      </th>
                      <td className="py-3 pr-4 tabular-nums">
                        {lab.value.value}
                        {lab.unit !== null && <span className="text-slate-600"> {lab.unit}</span>}
                      </td>
                      <td className="py-3 pr-4 text-slate-700">
                        {lab.referenceText ?? (
                          <span className="text-slate-500">None printed</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={lab.status} />
                      </td>
                      <td className="py-3">
                        <OriginBadge origin={lab.value.origin} verified={lab.value.verified} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
