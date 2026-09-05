import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import { ConfidenceBadge, confidenceLevel } from './ConfidenceBadge';

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
};

describe('confidenceLevel', () => {
  it.each([
    [1, 'high'],
    [0.96, 'high'],
    [0.85, 'high'],
    [0.84, 'medium'],
    [0.6, 'medium'],
    [0.51, 'medium'],
    [0.5, 'low'],
    [0.41, 'low'],
    [0, 'low'],
  ])('maps %s to %s', (confidence, expected) => {
    expect(confidenceLevel(confidence)).toBe(expected);
  });

  it('uses the same 0.5 boundary as the audit low-confidence finding', () => {
    // lib/verification/audit.ts flags confidence <= 0.5. The badge must agree, or a field
    // could be flagged in the integrity panel while reading "medium" in the table.
    expect(confidenceLevel(0.5)).toBe('low');
    expect(confidenceLevel(0.51)).toBe('medium');
  });
});

describe('ConfidenceBadge', () => {
  it('shows text, not just an icon', () => {
    render(<ConfidenceBadge confidence={0.96} />);

    expect(screen.getByText(/High confidence/)).toBeInTheDocument();
  });

  it('shows the percentage', () => {
    render(<ConfidenceBadge confidence={0.96} />);

    expect(screen.getByText(/96%/)).toBeInTheDocument();
  });

  it('flags a low-confidence field for review in its label', () => {
    render(<ConfidenceBadge confidence={0.41} />);

    expect(screen.getByText(/Low confidence — check this/)).toBeInTheDocument();
  });

  it('rounds the percentage rather than showing a float', () => {
    render(<ConfidenceBadge confidence={0.415} />);

    expect(screen.getByText(/42%/)).toBeInTheDocument();
  });

  it('never claims the value is correct', () => {
    const { container } = render(<ConfidenceBadge confidence={0.96} />);

    // "confidence" describes the model's self-report; nothing here may imply correctness.
    expect(container.textContent).not.toMatch(/accurate|correct|verified|reliable|proven/i);
  });

  it('says in its description that confidence is not verification', () => {
    render(<ConfidenceBadge confidence={0.41} />);

    const badge = screen.getByTitle(/says nothing about whether the value matched the source/i);
    expect(badge).toBeInTheDocument();
  });

  it('has no axe violations at each level', async () => {
    for (const confidence of [0.96, 0.7, 0.2]) {
      const { container, unmount } = render(<ConfidenceBadge confidence={confidence} />);

      expect((await axe.run(container, AXE_OPTIONS)).violations).toEqual([]);
      unmount();
    }
  });
});
