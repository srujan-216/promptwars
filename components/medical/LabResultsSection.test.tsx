import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import { LabResultsSection } from './LabResultsSection';
import type { LabResult, RangeStatus } from '@/lib/domain/types';

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
};

function lab(canonicalName: string, status: RangeStatus, rawName = canonicalName): LabResult {
  return {
    rawName,
    canonicalName,
    value: { value: 11.2, origin: 'ai_extracted', confidence: 0.9, verified: true },
    unit: 'g/dL',
    referenceText: null,
    refLow: null,
    refHigh: null,
    refUnit: null,
    status,
  };
}

const LABS = [
  lab('Hemoglobin', 'low', 'Haemoglobin'),
  lab('Platelet Count', 'normal', 'PLT'),
  lab('Ferritin', 'no_reference_in_source'),
];

describe('LabResultsSection — search', () => {
  it('shows every result initially', () => {
    render(<LabResultsSection labs={LABS} />);

    expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3
  });

  it('filters by canonical name', async () => {
    const user = userEvent.setup();
    render(<LabResultsSection labs={LABS} />);

    await user.type(screen.getByLabelText('Search tests'), 'ferritin');

    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByRole('row', { name: /Ferritin/ })).toBeInTheDocument();
  });

  it('finds a row by the name the report printed', async () => {
    const user = userEvent.setup();
    render(<LabResultsSection labs={LABS} />);

    // The report printed "PLT"; the record shows "Platelet Count".
    await user.type(screen.getByLabelText('Search tests'), 'PLT');

    expect(screen.getByRole('row', { name: /Platelet Count/ })).toBeInTheDocument();
  });

  it('says when nothing matches, without implying the record is empty', async () => {
    const user = userEvent.setup();
    render(<LabResultsSection labs={LABS} />);

    await user.type(screen.getByLabelText('Search tests'), 'vitamin');

    expect(screen.getByText(/No results match this search/)).toBeInTheDocument();
    expect(screen.getByText(/3 results are still in the record/)).toBeInTheDocument();
  });
});

describe('LabResultsSection — status filter', () => {
  it('filters to a single status', async () => {
    const user = userEvent.setup();
    render(<LabResultsSection labs={LABS} />);

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'low');

    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByRole('row', { name: /Hemoglobin/ })).toBeInTheDocument();
  });

  it('offers only statuses present in the data', () => {
    render(<LabResultsSection labs={LABS} />);

    const select = screen.getByLabelText('Filter by status');
    const options = within(select).getAllByRole('option').map((option) => option.textContent);

    expect(options).toContain('All statuses');
    expect(options).toContain('Below printed range');
    expect(options).not.toContain('Above printed range');
  });

  it('combines with the search query', async () => {
    const user = userEvent.setup();
    render(<LabResultsSection labs={LABS} />);

    await user.type(screen.getByLabelText('Search tests'), 'hemo');
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'normal');

    expect(screen.getByText(/No results match this search/)).toBeInTheDocument();
  });
});

describe('LabResultsSection — result count is announced', () => {
  it('reports the full count initially', () => {
    render(<LabResultsSection labs={LABS} />);

    expect(screen.getByText('Showing all 3 results.')).toBeInTheDocument();
  });

  it('updates the count as the filter narrows', async () => {
    const user = userEvent.setup();
    render(<LabResultsSection labs={LABS} />);

    await user.type(screen.getByLabelText('Search tests'), 'ferritin');

    expect(screen.getByText('Showing 1 of 3 results.')).toBeInTheDocument();
  });

  it('puts the count in a live region', () => {
    const { container } = render(<LabResultsSection labs={LABS} />);

    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('Showing all 3 results.');
  });
});

describe('LabResultsSection — edge cases and a11y', () => {
  it('renders an empty-state message with no labs and no filter controls', () => {
    render(<LabResultsSection labs={[]} />);

    expect(screen.getByText(/No laboratory results were found/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Search tests')).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<LabResultsSection labs={LABS} />);

    expect((await axe.run(container, AXE_OPTIONS)).violations).toEqual([]);
  });

  it('has no axe violations in the no-match state', async () => {
    const user = userEvent.setup();
    const { container } = render(<LabResultsSection labs={LABS} />);

    await user.type(screen.getByLabelText('Search tests'), 'vitamin');

    expect((await axe.run(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
