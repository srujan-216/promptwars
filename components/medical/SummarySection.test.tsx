import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import { SummarySection, type SummaryView } from './SummarySection';

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
};

function summary(overrides: Partial<SummaryView> = {}): SummaryView {
  return {
    text: 'Hemoglobin was 11.2 g/dL, below the range of 13.0 - 17.0 g/dL printed on the report.',
    source: 'generated',
    guardrailTriggered: false,
    rejectedAttemptCount: 0,
    ...overrides,
  };
}

describe('SummarySection — clean generation', () => {
  it('renders the summary text', () => {
    render(<SummarySection summary={summary()} />);

    expect(screen.getByText(/Hemoglobin was 11.2 g\/dL/)).toBeInTheDocument();
  });

  it('badges the text as AI-written', () => {
    render(<SummarySection summary={summary()} />);

    expect(screen.getByText('AI-written')).toBeInTheDocument();
  });

  it('does not claim the guardrail fired when it did not', () => {
    render(<SummarySection summary={summary()} />);

    expect(screen.queryByText(/Safety guardrail fired/)).not.toBeInTheDocument();
  });
});

describe('SummarySection — guardrail visibility', () => {
  it('says visibly when the guardrail fired', () => {
    render(
      <SummarySection
        summary={summary({ source: 'regenerated', guardrailTriggered: true, rejectedAttemptCount: 1 })}
      />,
    );

    expect(screen.getByText(/Safety guardrail fired/)).toBeInTheDocument();
    expect(screen.getByText(/One generated summary was rejected/)).toBeInTheDocument();
  });

  it('reports multiple rejected attempts', () => {
    render(
      <SummarySection
        summary={summary({
          source: 'deterministic_template',
          guardrailTriggered: true,
          rejectedAttemptCount: 2,
        })}
      />,
    );

    expect(screen.getByText(/2 generated summaries were rejected/)).toBeInTheDocument();
  });

  it('does not badge the deterministic template as AI-written', () => {
    render(
      <SummarySection
        summary={summary({
          source: 'deterministic_template',
          guardrailTriggered: true,
          rejectedAttemptCount: 2,
        })}
      />,
    );

    // No AI wrote it, and no user provided it. It gets its own honest label.
    expect(screen.queryByText('AI-written')).not.toBeInTheDocument();
    expect(screen.getByText('Written by deterministic code')).toBeInTheDocument();
  });

  it('explains that both attempts were rejected in the template case', () => {
    render(
      <SummarySection
        summary={summary({
          source: 'deterministic_template',
          guardrailTriggered: true,
          rejectedAttemptCount: 2,
        })}
      />,
    );

    expect(screen.getByText(/Both AI attempts used language this system does not permit/)).toBeInTheDocument();
  });
});

describe('SummarySection — no summary available', () => {
  it('says why nothing was generated rather than rendering an empty box', () => {
    render(<SummarySection summary={null} />);

    expect(screen.getByText(/No summary was generated/)).toBeInTheDocument();
    expect(screen.getByText(/GEMINI_API_KEY/)).toBeInTheDocument();
  });

  it('states that it will not fabricate prose to fill the gap', () => {
    render(<SummarySection summary={null} />);

    expect(screen.getByText(/will not fabricate prose/)).toBeInTheDocument();
  });

  it('shows no AI badge when there is no summary', () => {
    render(<SummarySection summary={null} />);

    expect(screen.queryByText('AI-written')).not.toBeInTheDocument();
  });
});

describe('SummarySection — accessibility', () => {
  it.each([
    ['clean', summary()],
    ['guardrail fired', summary({ source: 'regenerated', guardrailTriggered: true, rejectedAttemptCount: 1 })],
    ['template fallback', summary({ source: 'deterministic_template', guardrailTriggered: true, rejectedAttemptCount: 2 })],
  ])('has no axe violations — %s', async (_label, value) => {
    const { container } = render(<SummarySection summary={value} />);

    expect((await axe.run(container, AXE_OPTIONS)).violations).toEqual([]);
  });

  it('has no axe violations with no summary', async () => {
    const { container } = render(<SummarySection summary={null} />);

    expect((await axe.run(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
