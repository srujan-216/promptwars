import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import HomePage from './page';

/**
 * jsdom cannot run axe's color-contrast rule (it needs a real canvas to sample pixels),
 * so it is disabled explicitly rather than silently skipped. Contrast is a manual check.
 * Every other WCAG 2 A/AA rule runs.
 */
const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
};

describe('HomePage — accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = render(<HomePage />);

    const results = await axe.run(container, AXE_OPTIONS);

    expect(results.violations).toEqual([]);
  });

  it('has exactly one h1', () => {
    render(<HomePage />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('exposes a main landmark', () => {
    render(<HomePage />);

    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('gives every section an accessible name', () => {
    render(<HomePage />);

    for (const region of screen.getAllByRole('region')) {
      expect(region).toHaveAccessibleName();
    }
  });

  it('has no axe violations after a quarantined field is manually verified', async () => {
    const user = userEvent.setup();
    const { container } = render(<HomePage />);

    await user.click(screen.getAllByRole('button', { name: 'Verify manually' })[0]!);

    const results = await axe.run(container, AXE_OPTIONS);

    expect(results.violations).toEqual([]);
  });
});

describe('HomePage — the safety banner', () => {
  it('states that this is not medical advice', () => {
    render(<HomePage />);

    expect(screen.getByRole('note', { name: 'Scope of this tool' })).toHaveTextContent(
      /not medical advice/i,
    );
  });

  it('tells the reader to consult a clinician', () => {
    render(<HomePage />);

    expect(screen.getByRole('note', { name: 'Scope of this tool' })).toHaveTextContent(
      /qualified clinician/i,
    );
  });
});

describe('HomePage — honesty about the sample', () => {
  it('labels the example as synthetic', () => {
    render(<HomePage />);

    expect(screen.getByText(/Worked example — synthetic data/)).toBeInTheDocument();
  });

  it('says document upload is not built', () => {
    render(<HomePage />);

    expect(screen.getByText(/Document upload is not built yet/)).toBeInTheDocument();
  });
});

describe('HomePage — integrity panel surfaces the verification result', () => {
  it('reports the rejected reference range', () => {
    render(<HomePage />);

    const panel = screen.getByRole('region', { name: /Extraction integrity/i });

    expect(within(panel).getByText(/30 - 400 ng\/mL/)).toBeInTheDocument();
    expect(within(panel).getAllByText(/rejected/i).length).toBeGreaterThan(0);
  });

  it('reports the quarantined field', () => {
    render(<HomePage />);

    const panel = screen.getByRole('region', { name: /Extraction integrity/i });

    expect(within(panel).getAllByText(/Vitamin D/).length).toBeGreaterThan(0);
  });

  it('links each finding to the field it concerns', () => {
    render(<HomePage />);

    const panel = screen.getByRole('region', { name: /Extraction integrity/i });
    const links = within(panel).getAllByRole('link');

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute('href')).toMatch(/^#labs\./);
    }
  });
});

describe('HomePage — quarantine is never mixed with verified data', () => {
  it('shows the unverifiable field in the quarantine region only', () => {
    render(<HomePage />);

    const record = screen.getByRole('region', { name: /Structured record/i });
    const quarantine = screen.getByRole('region', { name: /Quarantined/i });

    expect(within(quarantine).getAllByText(/Vitamin D/).length).toBeGreaterThan(0);
    // The point of the rule: it must appear NOWHERE in the verified record.
    expect(within(record).queryAllByText(/Vitamin D/)).toHaveLength(0);
  });

  it('shows the Ferritin range as absent rather than using the rejected one', () => {
    render(<HomePage />);

    const record = screen.getByRole('region', { name: /Structured record/i });
    const row = within(record).getByRole('row', { name: /Ferritin/ });

    expect(within(row).getByText('None printed')).toBeInTheDocument();
    expect(within(row).getByText('No range in source')).toBeInTheDocument();
  });

  it('communicates status with text, not colour alone', () => {
    render(<HomePage />);

    const record = screen.getByRole('region', { name: /Structured record/i });
    const row = within(record).getByRole('row', { name: /Hemoglobin/ });

    // The word itself is present, so the meaning survives greyscale.
    expect(within(row).getByText('Below printed range')).toBeInTheDocument();
  });
});

describe('HomePage — manual verification', () => {
  it('flips a quarantined field to human-verified', async () => {
    const user = userEvent.setup();
    render(<HomePage />);

    const quarantine = screen.getByRole('region', { name: /Quarantined/i });
    await user.click(within(quarantine).getByRole('button', { name: 'Verify manually' }));

    expect(within(quarantine).getByText('Checked by a person')).toBeInTheDocument();
  });

  it('retains the previous value after manual verification', async () => {
    const user = userEvent.setup();
    render(<HomePage />);

    const quarantine = screen.getByRole('region', { name: /Quarantined/i });
    await user.click(within(quarantine).getByRole('button', { name: 'Verify manually' }));

    expect(within(quarantine).getByText(/Previous value retained/)).toBeInTheDocument();
  });

  it('removes the action once the field has been verified', async () => {
    const user = userEvent.setup();
    render(<HomePage />);

    const quarantine = screen.getByRole('region', { name: /Quarantined/i });
    await user.click(within(quarantine).getByRole('button', { name: 'Verify manually' }));

    expect(
      within(quarantine).queryByRole('button', { name: 'Verify manually' }),
    ).not.toBeInTheDocument();
  });

  it('updates the outstanding count', async () => {
    const user = userEvent.setup();
    render(<HomePage />);

    const quarantine = screen.getByRole('region', { name: /Quarantined/i });
    expect(within(quarantine).getByText(/1 of 1 still awaiting review/)).toBeInTheDocument();

    await user.click(within(quarantine).getByRole('button', { name: 'Verify manually' }));

    expect(within(quarantine).getByText(/0 of 1 still awaiting review/)).toBeInTheDocument();
  });
});
