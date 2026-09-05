import type { ReactElement } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HomePage(): ReactElement {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">MedLens</h1>
        <p className="text-lg text-slate-700">
          Turn fragmented medical documents and patient-entered data into a structured, traceable,
          reviewable patient record.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Scope boundary</CardTitle>
          <CardDescription>What this system does and does not do.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-700">
            MedLens extracts values, units and reference ranges from documents you provide, and
            shows where every field came from. It does not diagnose, prescribe, or recommend
            treatment, and it never infers a reference range that is absent from the source
            document.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Phase 0</CardTitle>
          <CardDescription>Project scaffold. No clinical features are implemented.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-700">
            See <code className="rounded bg-slate-100 px-1 py-0.5">docs/TRACEABILITY.md</code> for
            the status of every requirement.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
