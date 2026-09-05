import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HomePage from './page';

/**
 * The print contract.
 *
 * jsdom does not evaluate `@media print`, so these tests assert the contract structurally:
 * anything that must survive onto paper carries no `print:hidden`, and anything that must
 * not survive does. That is a real, checkable property rather than a visual guess.
 *
 * The rule that matters most here is CLAUDE.md rule 10. Status and origin are carried by
 * icon PLUS TEXT, never colour alone — which is exactly why a greyscale printer loses
 * nothing. If either had been communicated by colour, printing is where it would have
 * broken, so these tests check the text is present rather than the colour class.
 */

/** True when this element or any ancestor is hidden from print. */
function isHiddenInPrint(element: HTMLElement | null): boolean {
  let current: HTMLElement | null = element;
  while (current !== null) {
    if (current.classList.contains('print:hidden')) return true;
    current = current.parentElement;
  }
  return false;
}

describe('print — what must survive onto paper', () => {
  it('keeps the not-medical-advice notice', () => {
    render(<HomePage />);

    const notice = screen.getByRole('note', { name: 'Scope of this tool' });

    expect(notice).toHaveTextContent(/not medical advice/i);
    expect(isHiddenInPrint(notice)).toBe(false);
  });

  it('keeps the integrity counts', () => {
    render(<HomePage />);

    expect(isHiddenInPrint(screen.getByRole('region', { name: /Extraction integrity/i }))).toBe(
      false,
    );
  });

  it('keeps the summary', () => {
    render(<HomePage />);

    expect(isHiddenInPrint(screen.getByRole('region', { name: 'Summary' }))).toBe(false);
  });

  it('keeps the structured record', () => {
    render(<HomePage />);

    expect(isHiddenInPrint(screen.getByRole('region', { name: /Structured record/i }))).toBe(
      false,
    );
  });

  it('keeps conflicts and clarification questions', () => {
    render(<HomePage />);

    expect(isHiddenInPrint(screen.getByRole('region', { name: /Contradictions found/i }))).toBe(
      false,
    );
    expect(
      isHiddenInPrint(screen.getByRole('region', { name: /Questions that would improve/i })),
    ).toBe(false);
  });

  it('keeps the quarantine section, still separate and still labelled', () => {
    render(<HomePage />);

    const quarantine = screen.getByRole('region', { name: /Quarantined/i });

    expect(isHiddenInPrint(quarantine)).toBe(false);
    expect(quarantine).toHaveTextContent(/not verified against the document/i);
  });
});

describe('print — provenance survives (CR-5)', () => {
  it('keeps an origin badge on every field in the record', () => {
    render(<HomePage />);

    const record = screen.getByRole('region', { name: /Structured record/i });
    const badges = within(record).getAllByText(/Read from document|You entered this|AI-written/);

    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(isHiddenInPrint(badge)).toBe(false);
    }
  });

  it('keeps the verified / not-found marker on printed fields', () => {
    render(<HomePage />);

    const record = screen.getByRole('region', { name: /Structured record/i });
    const markers = within(record).getAllByText(/Matched to source|Not found in source/);

    expect(markers.length).toBeGreaterThan(0);
    for (const marker of markers) {
      expect(isHiddenInPrint(marker)).toBe(false);
    }
  });

  it('keeps the origin distinction visible for quarantined fields too', () => {
    render(<HomePage />);

    const quarantine = screen.getByRole('region', { name: /Quarantined/i });
    const badge = within(quarantine).getByText('Read from document');

    expect(isHiddenInPrint(badge)).toBe(false);
  });
});

describe('print — status is readable without colour (rule 10)', () => {
  it('prints the status word, not just a colour', () => {
    render(<HomePage />);

    const record = screen.getByRole('region', { name: /Structured record/i });
    const row = within(record).getByRole('row', { name: /Hemoglobin/ });
    const status = within(row).getByText('Below printed range');

    expect(isHiddenInPrint(status)).toBe(false);
  });

  it('prints a word for the no-range case as well', () => {
    render(<HomePage />);

    const record = screen.getByRole('region', { name: /Structured record/i });
    const row = within(record).getByRole('row', { name: /Ferritin/ });

    expect(isHiddenInPrint(within(row).getByText('No range in source'))).toBe(false);
  });

  it('every status badge carries text alongside its icon', () => {
    render(<HomePage />);

    const record = screen.getByRole('region', { name: /Structured record/i });
    const statuses = within(record).getAllByText(
      /Below printed range|Above printed range|Within printed range|No range in source|Range unreadable|Units differ/,
    );

    expect(statuses.length).toBeGreaterThan(0);
  });
});

describe('print — what must NOT reach paper', () => {
  it('hides the paste and intake form', () => {
    render(<HomePage />);

    expect(isHiddenInPrint(screen.getByLabelText('Report text'))).toBe(true);
    expect(isHiddenInPrint(screen.getByLabelText('Age'))).toBe(true);
  });

  it('hides the action buttons', () => {
    render(<HomePage />);

    expect(isHiddenInPrint(screen.getByRole('button', { name: 'Process report' }))).toBe(true);
    expect(isHiddenInPrint(screen.getByRole('button', { name: 'Save as PDF' }))).toBe(true);
  });

  it('hides the side-by-side source pane, which is navigation rather than record', () => {
    render(<HomePage />);

    expect(
      isHiddenInPrint(screen.getByRole('region', { name: /Source and extracted fields/i })),
    ).toBe(true);
  });
});
