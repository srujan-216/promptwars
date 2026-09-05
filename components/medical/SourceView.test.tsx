import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import { SourceView } from './SourceView';
import type { AuditedField } from '@/lib/verification/audit';

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
};

const SOURCE = `CITY DIAGNOSTIC LABORATORY
Hemoglobin        11.2 g/dL     13.0 - 17.0 g/dL
Ferritin          18 ng/mL`;

const VERIFIED: AuditedField = {
  path: 'labs.0',
  label: 'Hemoglobin',
  value: 11.2,
  origin: 'ai_extracted',
  confidence: 0.96,
  sourceQuote: 'Hemoglobin        11.2 g/dL     13.0 - 17.0 g/dL',
  verified: true,
  quarantined: false,
  referenceText: '13.0 - 17.0 g/dL',
  rejectedReferenceText: null,
};

const QUARANTINED: AuditedField = {
  path: 'labs.1',
  label: 'Vitamin D',
  value: 22,
  origin: 'ai_extracted',
  confidence: 0.41,
  sourceQuote: 'Vitamin D         22 ng/mL',
  verified: false,
  quarantined: true,
  referenceText: null,
  rejectedReferenceText: '30 - 100 ng/mL',
};

const FIELDS = [VERIFIED, QUARANTINED];

describe('SourceView — rendering', () => {
  it('shows the document text', () => {
    render(<SourceView sourceText={SOURCE} fields={FIELDS} />);

    expect(screen.getByText(/CITY DIAGNOSTIC LABORATORY/)).toBeInTheDocument();
  });

  it('lists each field as a button', () => {
    render(<SourceView sourceText={SOURCE} fields={FIELDS} />);

    expect(screen.getByRole('button', { name: /Hemoglobin/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Vitamin D/ })).toBeInTheDocument();
  });

  it('marks a quarantined field as having no source match', () => {
    render(<SourceView sourceText={SOURCE} fields={FIELDS} />);

    const button = screen.getByRole('button', { name: /Vitamin D/ });
    expect(within(button).getByText('Quote not found in source')).toBeInTheDocument();
  });

  it('renders nothing when there are no fields', () => {
    const { container } = render(<SourceView sourceText={SOURCE} fields={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('SourceView — selecting a verified field', () => {
  it('highlights its source text', async () => {
    const user = userEvent.setup();
    const { container } = render(<SourceView sourceText={SOURCE} fields={FIELDS} />);

    await user.click(screen.getByRole('button', { name: /Hemoglobin/ }));

    const mark = container.querySelector('mark');
    expect(mark?.textContent).toContain('Hemoglobin');
    expect(mark?.textContent).toContain('11.2 g/dL');
  });

  it('leaves the rest of the document intact around the highlight', async () => {
    const user = userEvent.setup();
    const { container } = render(<SourceView sourceText={SOURCE} fields={FIELDS} />);

    await user.click(screen.getByRole('button', { name: /Hemoglobin/ }));

    const pre = container.querySelector('pre');
    expect(pre?.textContent).toBe(SOURCE);
  });

  it('marks the selected field as pressed', async () => {
    const user = userEvent.setup();
    render(<SourceView sourceText={SOURCE} fields={FIELDS} />);

    const button = screen.getByRole('button', { name: /Hemoglobin/ });
    await user.click(button);

    expect(button).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('SourceView — selecting a quarantined field', () => {
  it('shows no highlight, because the quote is genuinely absent', async () => {
    const user = userEvent.setup();
    const { container } = render(<SourceView sourceText={SOURCE} fields={FIELDS} />);

    await user.click(screen.getByRole('button', { name: /Vitamin D/ }));

    expect(container.querySelector('mark')).toBeNull();
  });

  it('says explicitly that there is nothing to highlight', async () => {
    const user = userEvent.setup();
    render(<SourceView sourceText={SOURCE} fields={FIELDS} />);

    await user.click(screen.getByRole('button', { name: /Vitamin D/ }));

    expect(screen.getByText(/Nothing to highlight/)).toBeInTheDocument();
    expect(screen.getByText(/is not in this document/)).toBeInTheDocument();
  });

  it('still shows the full document', async () => {
    const user = userEvent.setup();
    const { container } = render(<SourceView sourceText={SOURCE} fields={FIELDS} />);

    await user.click(screen.getByRole('button', { name: /Vitamin D/ }));

    expect(container.querySelector('pre')?.textContent).toBe(SOURCE);
  });
});

describe('SourceView — keyboard access is real, not token', () => {
  it('reaches a field by tabbing', async () => {
    const user = userEvent.setup();
    render(<SourceView sourceText={SOURCE} fields={FIELDS} />);

    await user.tab();

    expect(screen.getByRole('button', { name: /Hemoglobin/ })).toHaveFocus();
  });

  it('activates the highlight with Enter', async () => {
    const user = userEvent.setup();
    const { container } = render(<SourceView sourceText={SOURCE} fields={FIELDS} />);

    await user.tab();
    await user.keyboard('{Enter}');

    expect(container.querySelector('mark')?.textContent).toContain('Hemoglobin');
  });

  it('activates the highlight with Space', async () => {
    const user = userEvent.setup();
    const { container } = render(<SourceView sourceText={SOURCE} fields={FIELDS} />);

    await user.tab();
    await user.keyboard(' ');

    expect(container.querySelector('mark')?.textContent).toContain('Hemoglobin');
  });

  it('reaches the second field by tabbing again', async () => {
    const user = userEvent.setup();
    render(<SourceView sourceText={SOURCE} fields={FIELDS} />);

    await user.tab();
    await user.tab();

    expect(screen.getByRole('button', { name: /Vitamin D/ })).toHaveFocus();
  });
});

describe('SourceView — announcements', () => {
  it('announces a successful highlight', async () => {
    const user = userEvent.setup();
    const { container } = render(<SourceView sourceText={SOURCE} fields={FIELDS} />);

    await user.click(screen.getByRole('button', { name: /Hemoglobin/ }));

    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('source text highlighted in the document');
  });

  it('announces when there is nothing to highlight', async () => {
    const user = userEvent.setup();
    const { container } = render(<SourceView sourceText={SOURCE} fields={FIELDS} />);

    await user.click(screen.getByRole('button', { name: /Vitamin D/ }));

    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('was not found in the document');
  });
});

describe('SourceView — accessibility', () => {
  it('has no axe violations before selection', async () => {
    const { container } = render(<SourceView sourceText={SOURCE} fields={FIELDS} />);

    expect((await axe.run(container, AXE_OPTIONS)).violations).toEqual([]);
  });

  it('has no axe violations with a highlight shown', async () => {
    const user = userEvent.setup();
    const { container } = render(<SourceView sourceText={SOURCE} fields={FIELDS} />);

    await user.click(screen.getByRole('button', { name: /Hemoglobin/ }));

    expect((await axe.run(container, AXE_OPTIONS)).violations).toEqual([]);
  });

  it('has no axe violations in the not-found state', async () => {
    const user = userEvent.setup();
    const { container } = render(<SourceView sourceText={SOURCE} fields={FIELDS} />);

    await user.click(screen.getByRole('button', { name: /Vitamin D/ }));

    expect((await axe.run(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
