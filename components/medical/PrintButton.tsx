'use client';

import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Save the record as a PDF, via the browser's own print pipeline.
 *
 * Deliberately not a generated PDF. A generator would re-implement the layout, and a second
 * implementation can drift from the first — the same class of bug as a highlighter whose
 * matching rules differ from the verifier's. Printing renders the page that is already on
 * screen, so the paper record and the screen record cannot disagree.
 *
 * What survives onto paper is controlled by the `@media print` block in `app/globals.css`
 * and by `print:hidden` on the controls. Origin badges, status badges, the quarantine
 * section and the not-medical-advice notice are all kept, and carry their meaning as icon
 * plus text rather than colour, so a greyscale printer loses nothing.
 */
export function PrintButton(): ReactElement {
  return (
    <div className="print:hidden">
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          window.print();
        }}
      >
        Save as PDF
      </Button>
      <p className="mt-1.5 text-sm text-slate-600">
        Opens your browser&apos;s print dialogue — choose &ldquo;Save as PDF&rdquo;. The printed
        record keeps every origin badge, every status, and the quarantined fields in their own
        section.
      </p>
    </div>
  );
}
