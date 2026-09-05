'use client';

import { useId, type ReactElement } from 'react';

import { STATUS_PRESENTATION } from '@/components/medical/StatusBadge';
import type { LabResult } from '@/lib/domain/types';
import { availableStatuses, describeResultCount, type StatusFilter } from '@/lib/view/filter';

/**
 * Search and filter controls for the laboratory results.
 *
 * The result count lives in an `aria-live` region: filtering changes a table further down
 * the page, and a screen-reader user gets no feedback from the act of typing otherwise.
 *
 * Screen-only — a printed record should show the whole record, not whatever happened to be
 * filtered when someone pressed print.
 */
export function LabFilter({
  labs,
  query,
  status,
  shownCount,
  onQueryChange,
  onStatusChange,
}: {
  labs: readonly LabResult[];
  query: string;
  status: StatusFilter;
  shownCount: number;
  onQueryChange: (next: string) => void;
  onStatusChange: (next: StatusFilter) => void;
}): ReactElement | null {
  const searchId = useId();
  const statusId = useId();

  if (labs.length === 0) return null;

  const statuses = availableStatuses(labs);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 print:hidden">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={searchId} className="text-sm font-medium text-slate-700">
            Search tests
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            placeholder="Try Hb, or platelet"
            onChange={(event) => {
              onQueryChange(event.target.value);
            }}
            className="w-full rounded-md border border-slate-300 p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          />
          <p className="text-xs text-slate-600">
            Searches the standardised name too, so &ldquo;Hb&rdquo; finds Hemoglobin.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={statusId} className="text-sm font-medium text-slate-700">
            Filter by status
          </label>
          <select
            id={statusId}
            value={status}
            onChange={(event) => {
              const raw = event.target.value;
              onStatusChange(
                raw === 'all' ? 'all' : (statuses.find((option) => option === raw) ?? 'all'),
              );
            }}
            className="w-full rounded-md border border-slate-300 p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            <option value="all">All statuses</option>
            {statuses.map((option) => (
              <option key={option} value={option}>
                {STATUS_PRESENTATION[option].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p aria-live="polite" className="text-sm text-slate-700">
        {describeResultCount(shownCount, labs.length)}
      </p>
    </div>
  );
}
