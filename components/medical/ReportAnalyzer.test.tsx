import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReportAnalyzer } from './ReportAnalyzer';

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
};

const EXAMPLE = 'Hemoglobin        11.2 g/dL     13.0 - 17.0 g/dL';

const OK_RESPONSE = {
  mode: 'pattern_fallback',
  servedFromCache: false,
  audit: {
    fieldsExtracted: 1,
    fieldsVerified: 1,
    fieldsQuarantined: 0,
    hallucinatedRangesRejected: 0,
    guardrailTriggered: false,
    aiCallCount: 0,
    deterministicStageCount: 6,
    findings: [],
    fields: [],
  },
  record: {
    patientInformation: [],
    symptoms: [],
    conditionsAndHistory: [],
    allergies: [],
    medications: [],
    labs: [],
    additionalObservations: [],
  },
  quarantined: [],
  comparison: [],
  summary: null,
};

function mockFetch(status: number, payload: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(payload),
      }),
    ),
  );
}

beforeEach(() => {
  mockFetch(200, OK_RESPONSE);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ReportAnalyzer — form basics', () => {
  it('labels the textarea', () => {
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    expect(screen.getByLabelText('Report text')).toBeInTheDocument();
  });

  it('loads the example document into the textarea', async () => {
    const user = userEvent.setup();
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Load example' }));

    expect(screen.getByLabelText('Report text')).toHaveValue(EXAMPLE);
  });

  it('renders the result after a successful submission', async () => {
    const user = userEvent.setup();
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Load example' }));
    await user.click(screen.getByRole('button', { name: 'Process report' }));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Extraction integrity/i })).toBeInTheDocument();
    });
  });
});

describe('ReportAnalyzer — error states', () => {
  it('rejects an empty submission without calling the server', async () => {
    const user = userEvent.setup();
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Process report' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Paste a report before processing.');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('marks the textarea invalid and describes the error', async () => {
    const user = userEvent.setup();
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Process report' }));

    const textarea = screen.getByLabelText('Report text');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    // The "!" glyph is aria-hidden, so it is correctly absent from the description.
    expect(textarea).toHaveAccessibleDescription('Paste a report before processing.');
  });

  it('moves focus to the textarea on validation failure', async () => {
    const user = userEvent.setup();
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Process report' }));

    expect(screen.getByLabelText('Report text')).toHaveFocus();
  });

  it('shows the server error message on a 422', async () => {
    mockFetch(422, { error: 'The document could not be read. Please check it and try again.' });
    const user = userEvent.setup();
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Load example' }));
    await user.click(screen.getByRole('button', { name: 'Process report' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('The document could not be read');
    });
  });

  it('never shows a stack trace', async () => {
    mockFetch(500, { error: 'Something went wrong while processing the document.' });
    const user = userEvent.setup();
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Load example' }));
    await user.click(screen.getByRole('button', { name: 'Process report' }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).not.toMatch(/at |Error:|\.ts:\d+/);
    });
  });

  it('reports a network failure without crashing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const user = userEvent.setup();
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Load example' }));
    await user.click(screen.getByRole('button', { name: 'Process report' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server');
    });
  });

  it('rejects a malformed server response rather than rendering it', async () => {
    mockFetch(200, { mode: 'nonsense' });
    const user = userEvent.setup();
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Load example' }));
    await user.click(screen.getByRole('button', { name: 'Process report' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('unexpected format');
    });
  });
});

describe('ReportAnalyzer — never silently fakes a model call', () => {
  it('says no AI was used when the server reports the pattern fallback', async () => {
    const user = userEvent.setup();
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Load example' }));
    await user.click(screen.getByRole('button', { name: 'Process report' }));

    await waitFor(() => {
      expect(screen.getByText('No AI was used for this result')).toBeInTheDocument();
    });
  });

  it('does not show that notice when Gemini actually ran', async () => {
    mockFetch(200, { ...OK_RESPONSE, mode: 'gemini' });
    const user = userEvent.setup();
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Load example' }));
    await user.click(screen.getByRole('button', { name: 'Process report' }));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Extraction integrity/i })).toBeInTheDocument();
    });
    expect(screen.queryByText('No AI was used for this result')).not.toBeInTheDocument();
  });
});

describe('ReportAnalyzer — accessibility', () => {
  it('has no axe violations before submission', async () => {
    const { container } = render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    expect((await axe.run(container, AXE_OPTIONS)).violations).toEqual([]);
  });

  it('has no axe violations in the error state', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Process report' }));

    expect((await axe.run(container, AXE_OPTIONS)).violations).toEqual([]);
  });

  it('has no axe violations after a successful submission', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Load example' }));
    await user.click(screen.getByRole('button', { name: 'Process report' }));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Extraction integrity/i })).toBeInTheDocument();
    });

    expect((await axe.run(container, AXE_OPTIONS)).violations).toEqual([]);
  });

  it('announces completion in a live region', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Load example' }));
    await user.click(screen.getByRole('button', { name: 'Process report' }));

    await waitFor(() => {
      const live = container.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toContain('Processing complete');
    });
  });
});

describe('ReportAnalyzer — previous report comparison', () => {
  it('offers an optional previous-report field', () => {
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    expect(screen.getByLabelText('Previous report (optional)')).toBeInTheDocument();
  });

  it('sends the previous report to the server', async () => {
    const user = userEvent.setup();
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Load example' }));
    await user.type(screen.getByLabelText('Previous report (optional)'), 'older report');
    await user.click(screen.getByRole('button', { name: 'Process report' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    const rawBody = vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.body;
    expect(typeof rawBody).toBe('string');

    const body: unknown = JSON.parse(typeof rawBody === 'string' ? rawBody : '{}');
    expect(body).toMatchObject({ previousDocumentText: 'older report' });
  });

  it('renders the comparison table when the server returns rows', async () => {
    mockFetch(200, {
      ...OK_RESPONSE,
      comparison: [
        {
          canonicalName: 'Hemoglobin',
          previous: 11.2,
          current: 13.4,
          unit: 'g/dL',
          delta: 2.2,
          percentChange: 19.6,
          direction: 'increased',
          onlyInPrevious: false,
          onlyInCurrent: false,
          unitMismatch: false,
        },
      ],
    });
    const user = userEvent.setup();
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Load example' }));
    await user.click(screen.getByRole('button', { name: 'Process report' }));

    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: /Comparison with previous report/i }),
      ).toBeInTheDocument();
    });
  });

  it('omits the comparison table when no previous report was supplied', async () => {
    const user = userEvent.setup();
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Load example' }));
    await user.click(screen.getByRole('button', { name: 'Process report' }));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Extraction integrity/i })).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('region', { name: /Comparison with previous report/i }),
    ).not.toBeInTheDocument();
  });
});

describe('ReportAnalyzer — quarantine stays separate', () => {
  it('renders quarantined fields outside the structured record', async () => {
    mockFetch(200, {
      ...OK_RESPONSE,
      quarantined: [
        {
          path: 'labs.0',
          label: 'Vitamin D',
          value: '22 ng/mL',
          origin: 'ai_extracted',
          claimedQuote: 'Vitamin D 22 ng/mL',
          reason: 'The quoted text was not found anywhere in the document.',
        },
      ],
    });
    const user = userEvent.setup();
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Load example' }));
    await user.click(screen.getByRole('button', { name: 'Process report' }));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Quarantined/i })).toBeInTheDocument();
    });

    const record = screen.getByRole('region', { name: /Structured record/i });
    expect(within(record).queryAllByText(/Vitamin D/)).toHaveLength(0);
  });
});

describe('ReportAnalyzer — summary rendering', () => {
  it('renders the summary section when the server returns one', async () => {
    mockFetch(200, {
      ...OK_RESPONSE,
      mode: 'gemini',
      summary: {
        text: 'Two results were transcribed from this document.',
        source: 'generated',
        guardrailTriggered: false,
        rejectedAttemptCount: 0,
      },
    });
    const user = userEvent.setup();
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Load example' }));
    await user.click(screen.getByRole('button', { name: 'Process report' }));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Summary' })).toBeInTheDocument();
    });
    expect(screen.getByText('Two results were transcribed from this document.')).toBeInTheDocument();
  });

  it('explains the absence when no summary was generated', async () => {
    const user = userEvent.setup();
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Load example' }));
    await user.click(screen.getByRole('button', { name: 'Process report' }));

    await waitFor(() => {
      expect(screen.getByText(/No summary was generated/)).toBeInTheDocument();
    });
  });

  it('does not claim the guardrail passed when no summary exists', async () => {
    const user = userEvent.setup();
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Load example' }));
    await user.click(screen.getByRole('button', { name: 'Process report' }));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Extraction integrity/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/guardrail passed the generated summary/)).not.toBeInTheDocument();
  });

  it('reports the guardrail result in the integrity panel once a summary exists', async () => {
    mockFetch(200, {
      ...OK_RESPONSE,
      mode: 'gemini',
      summary: {
        text: 'Two results were transcribed.',
        source: 'generated',
        guardrailTriggered: false,
        rejectedAttemptCount: 0,
      },
    });
    const user = userEvent.setup();
    render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Load example' }));
    await user.click(screen.getByRole('button', { name: 'Process report' }));

    await waitFor(() => {
      expect(screen.getByText(/guardrail passed the generated summary/)).toBeInTheDocument();
    });
  });

  it('has no axe violations with a summary rendered', async () => {
    mockFetch(200, {
      ...OK_RESPONSE,
      mode: 'gemini',
      summary: {
        text: 'Two results were transcribed.',
        source: 'regenerated',
        guardrailTriggered: true,
        rejectedAttemptCount: 1,
      },
    });
    const user = userEvent.setup();
    const { container } = render(<ReportAnalyzer exampleDocument={EXAMPLE} />);

    await user.click(screen.getByRole('button', { name: 'Load example' }));
    await user.click(screen.getByRole('button', { name: 'Process report' }));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Summary' })).toBeInTheDocument();
    });

    expect((await axe.run(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
