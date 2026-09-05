import type { ReactElement } from 'react';

import { AdviceBanner } from '@/components/medical/AdviceBanner';
import { IntegrityPanel } from '@/components/medical/IntegrityPanel';
import { QuarantineSection } from '@/components/medical/QuarantineSection';
import { StructuredRecord } from '@/components/medical/StructuredRecord';
import { buildSampleResult } from '@/lib/sample/example';

export default function HomePage(): ReactElement {
  const { audit, record, quarantined } = buildSampleResult();

  return (
    <>
      <AdviceBanner />

      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">MedLens</h1>
          <p className="max-w-prose text-lg text-slate-700">
            Most AI medical tools ask you to trust the model. MedLens verifies it. Every extracted
            field is matched against its source text, and every reference range is checked for
            verbatim presence in the document.
          </p>
        </header>

        {/*
          Honesty about what this page is. There is no upload form yet, so the interface is
          rendered from a synthetic document with a fixed stand-in for model output. The
          verification shown below is real: it is the production audit and range code running
          over that input.
        */}
        <aside
          aria-labelledby="sample-heading"
          className="rounded-lg border-2 border-dashed border-slate-400 bg-white p-4"
        >
          <h2 id="sample-heading" className="text-sm font-semibold text-slate-900">
            <span aria-hidden="true" className="mr-1.5">
              ⓘ
            </span>
            Worked example — synthetic data
          </h2>
          <p className="mt-1.5 max-w-prose text-sm text-slate-700">
            This is not a real patient, and no AI call was made to produce it. The document is
            fabricated and the model output is a fixture. What runs for real is the verification:
            the figures and findings below come from the same code that would check a live
            extraction. Document upload is not built yet.
          </p>
        </aside>

        <IntegrityPanel audit={audit} />

        <StructuredRecord data={record} />

        <QuarantineSection items={quarantined} />
      </main>
    </>
  );
}
