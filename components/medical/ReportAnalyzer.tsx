'use client';

import { useId, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { z } from 'zod';

import { ComparisonTable } from '@/components/medical/ComparisonTable';
import { ConflictsSection } from '@/components/medical/ConflictsSection';
import { QuestionsSection } from '@/components/medical/QuestionsSection';
import { IntakeForm } from '@/components/medical/IntakeForm';
import { IntegrityPanel } from '@/components/medical/IntegrityPanel';
import { QuarantineSection } from '@/components/medical/QuarantineSection';
import { PrintButton } from '@/components/medical/PrintButton';
import { SourceView } from '@/components/medical/SourceView';
import { SummarySection, type SummaryView } from '@/components/medical/SummarySection';
import { StructuredRecord, type RecordData } from '@/components/medical/StructuredRecord';
import type { QuarantinedItem } from '@/components/medical/QuarantineSection';
import { Button } from '@/components/ui/button';
import type { ClarificationQuestion } from '@/lib/clarify/questions';
import type { ComparedRow } from '@/lib/compare/diff';
import type { Conflict } from '@/lib/conflicts/detect';
import { EMPTY_INTAKE, intakeSchema, type Intake } from '@/lib/intake/schema';
import type { AuditReport } from '@/lib/verification/audit';

/**
 * Paste a report, process it, read the verified record.
 *
 * Accessibility specifics that matter here:
 * - the textarea is labelled, and on error carries aria-invalid + aria-describedby
 * - focus moves to the textarea on validation failure, so a keyboard user is taken to
 *   the thing they need to fix rather than left at the button
 * - status and errors live in aria-live regions, because the result appears well below
 *   the button and a sighted user's eye follows it while a screen-reader user's does not
 */

export interface AnalyzeResponse {
  mode: 'gemini' | 'pattern_fallback';
  audit: AuditReport;
  record: RecordData;
  quarantined: QuarantinedItem[];
  comparison: ComparedRow[];
  conflicts: Conflict[];
  questions: ClarificationQuestion[];
  summary: SummaryView | null;
  servedFromCache: boolean;
}

/**
 * Our own API is still a boundary, so the response is validated rather than asserted
 * (rule 1: no unsafe casts). The nested shapes are checked structurally via `z.custom`
 * — a real runtime predicate — instead of restating the whole AuditReport schema here,
 * which would duplicate it and drift.
 */
const objectLike = <T,>(): z.ZodType<T> =>
  z.custom<T>((value) => typeof value === 'object' && value !== null);

const analyzeResponseSchema: z.ZodType<AnalyzeResponse> = z.object({
  mode: z.enum(['gemini', 'pattern_fallback']),
  audit: objectLike<AuditReport>(),
  record: objectLike<RecordData>(),
  quarantined: z.array(objectLike<QuarantinedItem>()),
  comparison: z.array(objectLike<ComparedRow>()),
  conflicts: z.array(objectLike<Conflict>()),
  questions: z.array(objectLike<ClarificationQuestion>()),
  summary: objectLike<SummaryView>().nullable(),
  servedFromCache: z.boolean(),
});

export function ReportAnalyzer({ exampleDocument }: { exampleDocument: string }): ReactElement {
  const textareaId = useId();
  const previousTextareaId = useId();
  const errorId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [text, setText] = useState('');
  const [previousText, setPreviousText] = useState('');
  const [intake, setIntake] = useState<Intake>(EMPTY_INTAKE);
  const [intakeErrors, setIntakeErrors] = useState<Record<string, string>>({});
  const fieldIds = useRef<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'working'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  // The text the result was produced from, frozen at submit so later edits to the
  // textarea cannot desynchronise the source pane from the fields shown beside it.
  const [submittedText, setSubmittedText] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (text.trim() === '') {
      setError('Paste a report before processing.');
      setIntakeErrors({});
      setResult(null);
      textareaRef.current?.focus();
      return;
    }

    // Same schema the server re-runs. Failing here is a courtesy; the server decides.
    const validatedIntake = intakeSchema.safeParse(intake);
    if (!validatedIntake.success) {
      const collected: Record<string, string> = {};
      for (const issue of validatedIntake.error.issues) {
        const path = issue.path.join('.');
        collected[path] ??= issue.message;
      }
      setIntakeErrors(collected);
      setError('Some details need correcting before this can be processed.');
      setResult(null);

      const firstPath = Object.keys(collected)[0];
      const firstId = firstPath === undefined ? undefined : fieldIds.current[firstPath];
      if (firstId !== undefined) {
        document.getElementById(firstId)?.focus();
      }
      return;
    }

    setIntakeErrors({});

    setStatus('working');
    setError(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          documentText: text,
          previousDocumentText: previousText,
          intake: validatedIntake.data,
        }),
      });

      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof payload === 'object' &&
          payload !== null &&
          'error' in payload &&
          typeof payload.error === 'string'
            ? payload.error
            : 'The document could not be processed.';
        setError(message);
        setResult(null);
        textareaRef.current?.focus();
        return;
      }

      const validated = analyzeResponseSchema.safeParse(payload);
      if (!validated.success) {
        setError('The server returned a response in an unexpected format.');
        setResult(null);
        return;
      }

      setSubmittedText(text);
      setResult(validated.data);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setResult(null);
    } finally {
      setStatus('idle');
    }
  }

  const hasError = error !== null;

  return (
    <div className="flex flex-col gap-8">
      {/* Controls are screen-only: a printed record should carry the findings, not the form. */}
      <section
        aria-labelledby="paste-heading"
        className="rounded-lg border border-slate-200 bg-white p-5 print:hidden"
      >
        <h2 id="paste-heading" className="text-lg font-semibold text-slate-900">
          Paste a report
        </h2>

        <form
          onSubmit={(event) => {
            void onSubmit(event);
          }}
          className="mt-3 flex flex-col gap-3"
          noValidate
        >
          <label htmlFor={textareaId} className="text-sm font-medium text-slate-700">
            Report text
          </label>
          <textarea
            id={textareaId}
            ref={textareaRef}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
            rows={10}
            maxLength={100_000}
            aria-invalid={hasError}
            aria-describedby={hasError ? errorId : undefined}
            placeholder="Paste the text of a lab report here."
            className="w-full rounded-md border border-slate-300 p-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          />

          {hasError && (
            <p id={errorId} role="alert" className="flex items-start gap-2 text-sm text-red-800">
              <span aria-hidden="true" className="font-bold">
                !
              </span>
              <span>{error}</span>
            </p>
          )}

          <IntakeForm
            value={intake}
            onChange={setIntake}
            errors={intakeErrors}
            onRegisterFieldId={(path, id) => {
              fieldIds.current[path] = id;
            }}
          />

          <label htmlFor={previousTextareaId} className="mt-2 text-sm font-medium text-slate-700">
            Previous report (optional)
          </label>
          <p className="-mt-1 text-sm text-slate-600">
            Paste an earlier report to see what changed. It is verified the same way.
          </p>
          <textarea
            id={previousTextareaId}
            value={previousText}
            onChange={(event) => {
              setPreviousText(event.target.value);
            }}
            rows={6}
            maxLength={100_000}
            placeholder="Optional. Paste an earlier lab report here."
            className="w-full rounded-md border border-slate-300 p-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={status === 'working'}>
              {status === 'working' ? 'Processing…' : 'Process report'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setText(exampleDocument);
                setError(null);
              }}
            >
              Load example
            </Button>
          </div>

          {/* Announces completion, which happens far below the button. */}
          <p aria-live="polite" className="sr-only">
            {status === 'working'
              ? 'Processing report.'
              : result !== null
                ? `Processing complete. ${String(result.audit.fieldsVerified)} of ${String(result.audit.fieldsExtracted)} fields verified.`
                : ''}
          </p>
        </form>
      </section>

      {result !== null && (
        <>
          {result.mode === 'pattern_fallback' && (
            <aside
              aria-labelledby="mode-heading"
              className="rounded-lg border-2 border-dashed border-slate-400 bg-white p-4"
            >
              <h2 id="mode-heading" className="text-sm font-semibold text-slate-900">
                <span aria-hidden="true" className="mr-1.5">
                  ⓘ
                </span>
                No AI was used for this result
              </h2>
              <p className="mt-1.5 max-w-prose text-sm text-slate-700">
                No <code>GEMINI_API_KEY</code> is configured, so the values below were read by
                deterministic pattern matching over the text you pasted — no model was called.
                Everything after extraction is identical: the same verification, the same
                positional reference-range check, the same range evaluation.
              </p>
            </aside>
          )}

          <IntegrityPanel audit={result.audit} summaryGenerated={result.summary !== null} />
          <SummarySection summary={result.summary} />
          {/* Screen-only: the full document dump is navigation, not part of the record. */}
          <div className="print:hidden">
            <SourceView sourceText={submittedText} fields={result.audit.fields} />
          </div>
          <PrintButton />
          <ConflictsSection conflicts={result.conflicts} />
          <QuestionsSection questions={result.questions} />
          <ComparisonTable rows={result.comparison} />
          <StructuredRecord data={result.record} />
          <QuarantineSection items={result.quarantined} />
        </>
      )}
    </div>
  );
}
