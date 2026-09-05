import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import { ComparisonTable } from './ComparisonTable';
import { compareReports, type ComparedRow } from '@/lib/compare/diff';

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
};

function rowFor(previous: number, current: number): ComparedRow[] {
  return compareReports(
    [{ canonicalName: 'Hemoglobin', value: previous, unit: 'g/dL' }],
    [{ canonicalName: 'Hemoglobin', value: current, unit: 'g/dL' }],
  );
}

describe('ComparisonTable — arithmetic change only', () => {
  it('reports an increase with its magnitude', () => {
    render(<ComparisonTable rows={rowFor(11.2, 13.4)} />);

    expect(screen.getByText(/Increased by 2\.2 g\/dL/)).toBeInTheDocument();
  });

  it('reports a decrease with its magnitude', () => {
    render(<ComparisonTable rows={rowFor(14, 11.2)} />);

    expect(screen.getByText(/Decreased by 2\.8 g\/dL/)).toBeInTheDocument();
  });

  it('reports an unchanged value', () => {
    render(<ComparisonTable rows={rowFor(13, 13)} />);

    expect(screen.getByText('Unchanged')).toBeInTheDocument();
  });

  it('includes the percentage change', () => {
    render(<ComparisonTable rows={rowFor(10, 12)} />);

    expect(screen.getByText(/20%/)).toBeInTheDocument();
  });

  it('shows both values in the row', () => {
    render(<ComparisonTable rows={rowFor(11.2, 13.4)} />);

    const row = screen.getByRole('row', { name: /Hemoglobin/ });
    expect(within(row).getByText('11.2 g/dL')).toBeInTheDocument();
    expect(within(row).getByText('13.4 g/dL')).toBeInTheDocument();
  });
});

describe('ComparisonTable — never frames a change as good or bad', () => {
  it('contains no language framing a change as good or bad', () => {
    // A falling haemoglobin and a falling cholesterol both read "Decreased" here.
    // Any word implying which is desirable would be clinical judgement.
    const rows = [
      ...rowFor(14, 11.2),
      ...compareReports(
        [{ canonicalName: 'LDL Cholesterol', value: 190, unit: 'mg/dL' }],
        [{ canonicalName: 'LDL Cholesterol', value: 120, unit: 'mg/dL' }],
      ),
      ...compareReports([], [{ canonicalName: 'Ferritin', value: 18, unit: 'ng/mL' }]),
      ...compareReports([{ canonicalName: 'TSH', value: 2.1, unit: 'mIU/L' }], []),
    ];

    const { container } = render(<ComparisonTable rows={rows} />);

    const forbidden =
      /\b(improv\w*|worse\w*|worsen\w*|deteriorat\w*|better|good|bad|concerning|alarming|healthy|abnormal|normal range|favourable|favorable|positive sign|negative sign|progress\w*|recover\w*)\b/i;

    expect(container.textContent ?? '').not.toMatch(forbidden);
  });

  it('uses the same wording for a rise regardless of the analyte', () => {
    const { container: a } = render(<ComparisonTable rows={rowFor(10, 12)} />);
    const first = a.textContent ?? '';

    const { container: b } = render(
      <ComparisonTable
        rows={compareReports(
          [{ canonicalName: 'LDL Cholesterol', value: 10, unit: 'g/dL' }],
          [{ canonicalName: 'LDL Cholesterol', value: 12, unit: 'g/dL' }],
        )}
      />,
    );

    expect(first).toContain('Increased by 2');
    expect(b.textContent ?? '').toContain('Increased by 2');
  });

  it('conveys direction with a word, not the arrow alone', () => {
    const { container } = render(<ComparisonTable rows={rowFor(11.2, 13.4)} />);

    // The arrow is aria-hidden decoration; the word must carry the meaning.
    expect(container.textContent).toContain('Increased');
  });
});

describe('ComparisonTable — one-sided and incomparable rows', () => {
  it('marks an analyte absent from the previous report', () => {
    render(
      <ComparisonTable
        rows={compareReports([], [{ canonicalName: 'Ferritin', value: 18, unit: 'ng/mL' }])}
      />,
    );

    expect(screen.getByText('Not in previous report')).toBeInTheDocument();
  });

  it('marks an analyte absent from the current report rather than dropping it', () => {
    render(
      <ComparisonTable
        rows={compareReports([{ canonicalName: 'TSH', value: 2.1, unit: 'mIU/L' }], [])}
      />,
    );

    expect(screen.getByRole('row', { name: /TSH/ })).toBeInTheDocument();
    expect(screen.getByText('Not in current report')).toBeInTheDocument();
  });

  it('refuses to compare across differing units', () => {
    render(
      <ComparisonTable
        rows={compareReports(
          [{ canonicalName: 'Glucose', value: 90, unit: 'mg/dL' }],
          [{ canonicalName: 'Glucose', value: 5, unit: 'mmol/L' }],
        )}
      />,
    );

    expect(screen.getByText(/Units differ — not compared/)).toBeInTheDocument();
  });
});

describe('ComparisonTable — matching and rendering', () => {
  it('matches on canonical name, not the raw printed string', () => {
    // "Hb" and "Haemoglobin" normalize to the same canonical name upstream, so this
    // arrives as a single row rather than two.
    const rows = compareReports(
      [{ canonicalName: 'Hemoglobin', value: 11.2, unit: 'g/dL' }],
      [{ canonicalName: 'Hemoglobin', value: 13.4, unit: 'g/dL' }],
    );

    render(<ComparisonTable rows={rows} />);

    expect(screen.getAllByRole('row')).toHaveLength(2); // header + one data row
  });

  it('renders nothing when there is no previous report', () => {
    const { container } = render(<ComparisonTable rows={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('has no axe violations', async () => {
    const { container } = render(<ComparisonTable rows={rowFor(11.2, 13.4)} />);

    expect((await axe.run(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
