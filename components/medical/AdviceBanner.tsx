import type { ReactElement } from 'react';

/**
 * Persistent scope banner (CLAUDE.md rule 5).
 *
 * Sticky, so it stays on screen while the record is scrolled — a disclaimer that scrolls
 * away has stopped doing its job. `role="note"` rather than `role="alert"`: it is
 * permanent context, and an alert would interrupt a screen reader on every render.
 */
export function AdviceBanner(): ReactElement {
  return (
    <div
      role="note"
      aria-label="Scope of this tool"
      className="sticky top-0 z-10 border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm text-amber-950"
    >
      <span aria-hidden="true" className="mr-1.5 font-bold">
        !
      </span>
      This is not medical advice. MedLens reports what your document says and where it says it.
      It does not diagnose. Discuss any result with a qualified clinician.
    </div>
  );
}
