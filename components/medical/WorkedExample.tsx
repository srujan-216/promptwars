import type { ReactElement } from 'react';

import { ConflictsSection } from '@/components/medical/ConflictsSection';
import { IntegrityPanel } from '@/components/medical/IntegrityPanel';
import { QuarantineSection } from '@/components/medical/QuarantineSection';
import { QuestionsSection } from '@/components/medical/QuestionsSection';
import { StructuredRecord } from '@/components/medical/StructuredRecord';
import { PrintButton } from '@/components/medical/PrintButton';
import { SourceView } from '@/components/medical/SourceView';
import { SummarySection } from '@/components/medical/SummarySection';
import { buildSampleResult, SAMPLE_DOCUMENT } from '@/lib/sample/example';

/**
 * A complete result, end to end, with no API key required.
 *
 * This exists because the repo's default state would otherwise undersell what is built: a
 * reader with no `GEMINI_API_KEY` sees the degraded path everywhere, and never sees a
 * rejected range, a quarantined field, or the guardrail firing.
 *
 * It is not a demo trick, and the label below says exactly why. Every stage shown here is
 * real code with real tests running over the fixture. The ONLY recorded part is the model's
 * response — the thing that genuinely cannot run without a key. The verification, range
 * evaluation, conflict rules and clarification questions all execute at render time.
 */
export function WorkedExample(): ReactElement {
  const { audit, record, quarantined, conflicts, questions, summary } = buildSampleResult();

  return (
    <section
      aria-labelledby="worked-example-heading"
      className="flex flex-col gap-6 border-t border-slate-300 pt-8"
    >
      <div className="rounded-lg border-2 border-dashed border-slate-400 bg-white p-4">
        <h2 id="worked-example-heading" className="text-base font-semibold text-slate-900">
          <span aria-hidden="true" className="mr-1.5">
            ⓘ
          </span>
          Worked example — recorded model response, everything else live
        </h2>
        <div className="mt-1.5 flex max-w-prose flex-col gap-2 text-sm text-slate-700">
          <p>
            Not a real patient. The document is fabricated and the AI&apos;s reply is a{' '}
            <strong>recorded fixture</strong>, captured from a real run — no model is called to
            render this page.
          </p>
          <p>
            <strong>Only the model response is recorded.</strong> Everything below it is the same
            production code that runs on live input, executing now: the source-quote
            verification, the positional reference-range check, range evaluation, conflict rules
            and clarification questions. Each has its own tests.
          </p>
          <p>
            The recorded reply deliberately misbehaves twice, because that is what is worth
            showing: it invents a <code>30 - 400 ng/mL</code> range for Ferritin that the report
            never printed, and reports a Vitamin D result quoting text that does not exist. It
            also tripped the summary guardrail on its first attempt.
          </p>
        </div>
      </div>

      <IntegrityPanel audit={audit} summaryGenerated />
      <SummarySection summary={summary} />
      <ConflictsSection conflicts={conflicts} />
      <QuestionsSection questions={questions} />
      <div className="print:hidden">
        <SourceView sourceText={SAMPLE_DOCUMENT} fields={audit.fields} />
      </div>
      <StructuredRecord data={record} />
      <QuarantineSection items={quarantined} />
      <PrintButton />
    </section>
  );
}
