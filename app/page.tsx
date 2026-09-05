import type { ReactElement } from 'react';

import { AdviceBanner } from '@/components/medical/AdviceBanner';
import { ReportAnalyzer } from '@/components/medical/ReportAnalyzer';
import { WorkedExample } from '@/components/medical/WorkedExample';
import { SAMPLE_DOCUMENT } from '@/lib/sample/example';

export default function HomePage(): ReactElement {
  return (
    <>
      {/*
        Skip link: the first focusable element, so a keyboard user can jump past the sticky
        banner and header straight to the content rather than tabbing through everything
        above it. It lives here rather than in the layout so the page test can prove it is
        first — an untestable a11y feature is one that quietly rots.
      */}
      <a
        href="#main-content"
        className="sr-only rounded-md bg-slate-900 px-4 py-2 text-slate-50 focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to main content
      </a>

      <AdviceBanner />

      <main id="main-content" tabIndex={-1} className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">MedLens</h1>
          <p className="max-w-prose text-lg text-slate-700">
            Most AI medical tools ask you to trust the model. MedLens verifies it. Every extracted
            field is matched against its source text, and every reference range must appear in the
            document <em>and</em> sit alongside the value it describes.
          </p>
          <p className="max-w-prose text-sm text-slate-600">
            Paste a lab report to run it through the pipeline. Below the form, a fixed worked
            example shows the verification rejecting an invented reference range and quarantining
            a value the AI could not source.
          </p>
        </header>

        <ReportAnalyzer exampleDocument={SAMPLE_DOCUMENT} />

        <WorkedExample />
      </main>
    </>
  );
}
