import type { ReactElement } from 'react';

import { IntegrityPanel } from '@/components/medical/IntegrityPanel';
import { QuarantineSection } from '@/components/medical/QuarantineSection';
import { StructuredRecord } from '@/components/medical/StructuredRecord';
import { buildSampleResult } from '@/lib/sample/example';

/**
 * A fixed demonstration of the two rejection paths.
 *
 * This is kept separate from the paste form on purpose. The form's no-key fallback is an
 * honest pattern matcher, so it never invents a reference range or quotes text that is not
 * there — which means it cannot demonstrate the checks that catch those things. Showing the
 * thesis therefore needs a fixture where the model output deliberately misbehaves.
 *
 * The document is synthetic and the model output is fixed. The verification is real
 * production code running over that input.
 */
export function WorkedExample(): ReactElement {
  const { audit, record, quarantined } = buildSampleResult();

  return (
    <section aria-labelledby="worked-example-heading" className="flex flex-col gap-6 border-t border-slate-300 pt-8">
      <div className="rounded-lg border-2 border-dashed border-slate-400 bg-white p-4">
        <h2 id="worked-example-heading" className="text-base font-semibold text-slate-900">
          <span aria-hidden="true" className="mr-1.5">
            ⓘ
          </span>
          Worked example — synthetic data, fixed AI output
        </h2>
        <p className="mt-1.5 max-w-prose text-sm text-slate-700">
          Not a real patient, and no AI call was made. The document is fabricated and the model
          output is a fixture in which the AI deliberately misbehaves twice: it invents a
          reference range of <code>30 - 400 ng/mL</code> for Ferritin, which the report never
          printed, and it reports a Vitamin D result quoting text that does not exist in the
          document. The verification below is the real production code catching both.
        </p>
      </div>

      <IntegrityPanel audit={audit} />
      <StructuredRecord data={record} />
      <QuarantineSection items={quarantined} />
    </section>
  );
}
