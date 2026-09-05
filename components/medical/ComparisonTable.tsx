import type { ReactElement } from 'react';

import type { ComparedRow } from '@/lib/compare/diff';

/**
 * Previous vs current report (item 19).
 *
 * Rows are matched on canonical analyte name from `lib/terminology/normalize.ts`, so
 * "Hb" in one report and "Haemoglobin" in the other are the same row.
 *
 * The Change column is ARITHMETIC ONLY. It says a number rose or fell and by how much. It
 * never says whether that is good, bad, improving or concerning — that is clinical
 * judgement, and a falling haemoglobin and a falling cholesterol would both read
 * "decreased" here. The test `contains no language framing a change as good or bad`
 * enforces this against the rendered output.
 *
 * Analytes present in only one report get their own row state rather than being dropped:
 * a test that stopped being run is information, not absence.
 */

function formatValue(value: number | null, unit: string | null): string {
  if (value === null) return '—';
  return unit === null ? String(value) : `${String(value)} ${unit}`;
}

function Change({ row }: { row: ComparedRow }): ReactElement {
  if (row.onlyInCurrent) {
    return <span className="text-slate-700">Not in previous report</span>;
  }
  if (row.onlyInPrevious) {
    return <span className="text-slate-700">Not in current report</span>;
  }
  if (row.unitMismatch) {
    return (
      <span className="text-slate-700">
        <span aria-hidden="true" className="mr-1">
          ≠
        </span>
        Units differ — not compared
      </span>
    );
  }
  if (row.delta === null || row.direction === null) {
    return <span className="text-slate-700">—</span>;
  }

  const arrow = row.direction === 'increased' ? '↑' : row.direction === 'decreased' ? '↓' : '→';
  const magnitude = Math.abs(row.delta);
  const rounded = Math.round(magnitude * 1000) / 1000;
  const percent =
    row.percentChange === null ? null : Math.round(Math.abs(row.percentChange) * 10) / 10;

  return (
    <span className="text-slate-900">
      <span aria-hidden="true" className="mr-1">
        {arrow}
      </span>
      {/* The word carries the meaning; the arrow is decoration. */}
      {row.direction === 'unchanged'
        ? 'Unchanged'
        : `${row.direction === 'increased' ? 'Increased' : 'Decreased'} by ${String(rounded)}${
            row.unit === null ? '' : ` ${row.unit}`
          }${percent === null ? '' : ` (${String(percent)}%)`}`}
    </span>
  );
}

export function ComparisonTable({ rows }: { rows: readonly ComparedRow[] }): ReactElement | null {
  if (rows.length === 0) return null;

  return (
    <section
      aria-labelledby="comparison-heading"
      className="rounded-lg border border-slate-200 bg-white p-5"
    >
      <h2 id="comparison-heading" className="text-lg font-semibold text-slate-900">
        Comparison with previous report
      </h2>

      <p className="mt-2 max-w-prose text-sm text-slate-600">
        Differences between the two reports, matched by test name. These are arithmetic
        differences only. What a change means is a question for a clinician.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <caption className="sr-only">
            Each row compares one test between the previous and current report.
          </caption>
          <thead>
            <tr className="border-b border-slate-200">
              <th scope="col" className="py-2 pr-4 font-semibold">
                Parameter
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                Previous
              </th>
              <th scope="col" className="py-2 pr-4 font-semibold">
                Current
              </th>
              <th scope="col" className="py-2 font-semibold">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.canonicalName} className="border-b border-slate-100">
                <th scope="row" className="py-3 pr-4 font-medium text-slate-900">
                  {row.canonicalName}
                </th>
                <td className="py-3 pr-4 tabular-nums">{formatValue(row.previous, row.unit)}</td>
                <td className="py-3 pr-4 tabular-nums">{formatValue(row.current, row.unit)}</td>
                <td className="py-3">
                  <Change row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
