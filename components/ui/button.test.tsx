import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('renders its accessible name', () => {
    render(<Button>Upload report</Button>);

    expect(screen.getByRole('button', { name: 'Upload report' })).toBeInTheDocument();
  });

  it('calls onClick when activated with the keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Confirm</Button>);

    await user.tab();
    await user.keyboard('{Enter}');

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick while disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Confirm
      </Button>,
    );

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('has no axe violations across every variant', async () => {
    const { container } = render(
      <div>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
      </div>,
    );

    // color-contrast is disabled explicitly, not silently: it needs a real canvas
    // to sample rendered pixels, which jsdom does not implement. Leaving it enabled
    // would make this test *look* like it verifies contrast while it quietly skips.
    // Contrast is a manual check until a browser-based a11y run exists (see README).
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });

    expect(results.violations).toEqual([]);
  });
});
