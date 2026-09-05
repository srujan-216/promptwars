'use client';

import { useId, useRef, useState, type ReactElement } from 'react';

import type { AuditedField } from '@/lib/verification/audit';
import { splitAroundQuote } from '@/lib/view/highlight';
import { cn } from '@/lib/utils';

/**
 * Side-by-side provenance view: the document on the left, the extracted fields on the right.
 *
 * Selecting a field highlights the exact text it came from. For a quarantined field there is
 * nothing to highlight, and the view says so — which is the whole point. Being *shown* that
 * the quoted text is genuinely absent from the document is more convincing than being told.
 *
 * Keyboard access is not an afterthought here. Each field is a real `<button>`, so it is
 * focusable, activates on Enter and Space natively, and is announced as a button — no
 * `tabindex` and no synthetic key handling. The result of activating one is announced in an
 * `aria-live` region, because the change happens in the other pane where a screen-reader
 * user's cursor is not.
 */

export function SourceView({
  sourceText,
  fields,
}: {
  sourceText: string;
  fields: readonly AuditedField[];
}): ReactElement | null {
  const headingId = useId();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const markRef = useRef<HTMLElement>(null);

  if (fields.length === 0) return null;

  const selected = fields.find((field) => field.path === selectedPath) ?? null;
  const segments =
    selected === null ? null : splitAroundQuote(sourceText, selected.sourceQuote);

  function select(field: AuditedField): void {
    setSelectedPath(field.path);

    const found = splitAroundQuote(sourceText, field.sourceQuote) !== null;
    setAnnouncement(
      found
        ? `${field.label}: source text highlighted in the document.`
        : `${field.label}: the quoted text was not found in the document, so there is nothing to highlight.`,
    );

    // Scroll the highlight into view after render. Guarded because jsdom and older
    // browsers may not implement it.
    requestAnimationFrame(() => {
      markRef.current?.scrollIntoView?.({ block: 'center' });
    });
  }

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-slate-200 bg-white p-5"
    >
      <h2 id={headingId} className="text-lg font-semibold text-slate-900">
        Source and extracted fields
      </h2>
      <p className="mt-2 max-w-prose text-sm text-slate-600">
        Choose a field to see exactly where it came from. Quarantined fields have no
        highlight, because the text they quoted is not in the document.
      </p>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Document</h3>
          <pre className="max-h-96 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed whitespace-pre-wrap">
            {segments === null ? (
              sourceText
            ) : (
              <>
                {segments.before}
                <mark ref={markRef} className="rounded bg-amber-200 px-0.5 font-semibold">
                  {segments.match}
                </mark>
                {segments.after}
              </>
            )}
          </pre>
          {selected !== null && segments === null && (
            <p className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
              <span aria-hidden="true" className="font-bold">
                !
              </span>
              <span>
                Nothing to highlight: the text {selected.label} quoted is not in this document.
              </span>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Extracted fields</h3>
          <ul className="flex max-h-96 flex-col gap-1.5 overflow-auto">
            {fields.map((field) => {
              const isSelected = field.path === selectedPath;
              return (
                <li key={field.path}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      select(field);
                    }}
                    className={cn(
                      'w-full rounded-md border px-3 py-2 text-left text-sm transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900',
                      isSelected
                        ? 'border-slate-900 bg-slate-100'
                        : 'border-slate-200 hover:bg-slate-50',
                    )}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{field.label}</span>
                      <span className="text-slate-700">{String(field.value)}</span>
                      {field.quarantined ? (
                        <span className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-900">
                          <span aria-hidden="true">!</span>
                          <span>Quote not found in source</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-900">
                          <span aria-hidden="true">✓</span>
                          <span>Matched to source</span>
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
