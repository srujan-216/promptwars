import { describe, expect, it } from 'vitest';

import { createProvider, type ModelClient } from './provider';
import { generateSummary } from './summary';

const FACTS = {
  totalResults: 2,
  outsidePrintedRange: 1,
  noReferenceInSource: 1,
  fieldsVerified: 2,
  fieldsQuarantined: 0,
  rangesRejected: 0,
};

const NARRATIVE = 'Hemoglobin 9.4 g/dL, printed range 13.0 - 17.0 g/dL. Ferritin 18 ng/mL, no printed range.';

/** Returns a different summary on each successive call. */
function scriptedClient(summaries: readonly string[]): ModelClient & { calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    generateStructured: () => {
      const summary = summaries[calls] ?? summaries[summaries.length - 1] ?? '';
      calls += 1;
      return Promise.resolve(JSON.stringify({ summary }));
    },
  };
}

const SAFE = 'Hemoglobin was 9.4 g/dL, below the range of 13.0 - 17.0 g/dL printed on the report. Discuss these results with a qualified clinician.';
const UNSAFE = 'You have anaemia. Take ferrous sulphate 200 mg daily.';

describe('generateSummary — tier 1, clean generation', () => {
  it('returns generated text when it passes the guardrail', async () => {
    const provider = createProvider({ client: scriptedClient([SAFE]) });

    const result = await generateSummary({ provider, facts: FACTS, factsNarrative: NARRATIVE });

    expect(result.source).toBe('generated');
    expect(result.text).toBe(SAFE);
    expect(result.guardrailTriggered).toBe(false);
  });

  it('makes exactly one call when the first attempt is clean', async () => {
    const client = scriptedClient([SAFE]);
    const provider = createProvider({ client });

    await generateSummary({ provider, facts: FACTS, factsNarrative: NARRATIVE });

    expect(client.calls()).toBe(1);
  });
});

describe('generateSummary — tier 2, stricter retry', () => {
  it('regenerates once when the first attempt breaks a rule', async () => {
    const provider = createProvider({ client: scriptedClient([UNSAFE, SAFE]) });

    const result = await generateSummary({ provider, facts: FACTS, factsNarrative: NARRATIVE });

    expect(result.source).toBe('regenerated');
    expect(result.text).toBe(SAFE);
  });

  it('flags that the guardrail fired even though the retry succeeded', async () => {
    const provider = createProvider({ client: scriptedClient([UNSAFE, SAFE]) });

    const result = await generateSummary({ provider, facts: FACTS, factsNarrative: NARRATIVE });

    expect(result.guardrailTriggered).toBe(true);
    expect(result.rejectedAttempts).toHaveLength(1);
    expect(result.rejectedAttempts[0]?.violations.length).toBeGreaterThan(0);
  });

  it('never returns the rejected text', async () => {
    const provider = createProvider({ client: scriptedClient([UNSAFE, SAFE]) });

    const result = await generateSummary({ provider, facts: FACTS, factsNarrative: NARRATIVE });

    expect(result.text).not.toContain('You have anaemia');
  });
});

describe('generateSummary — tier 3, deterministic fallback', () => {
  it('falls back to the template when both attempts break rules', async () => {
    const provider = createProvider({ client: scriptedClient([UNSAFE, UNSAFE]) });

    const result = await generateSummary({ provider, facts: FACTS, factsNarrative: NARRATIVE });

    expect(result.source).toBe('deterministic_template');
    expect(result.guardrailTriggered).toBe(true);
    expect(result.rejectedAttempts).toHaveLength(2);
  });

  it('the fallback text itself passes the guardrail', async () => {
    const provider = createProvider({ client: scriptedClient([UNSAFE, UNSAFE]) });

    const result = await generateSummary({ provider, facts: FACTS, factsNarrative: NARRATIVE });

    expect(result.text).toContain('This report contains 2 results.');
    expect(result.text).not.toContain('anaemia');
  });

  it('falls back rather than failing when the provider throws', async () => {
    const provider = createProvider({
      client: { generateStructured: () => Promise.reject(new Error('network down')) },
      maxAttempts: 1,
      sleep: () => Promise.resolve(),
    });

    const result = await generateSummary({ provider, facts: FACTS, factsNarrative: NARRATIVE });

    expect(result.source).toBe('deterministic_template');
    expect(result.text).toContain('This report contains 2 results.');
  });

  it('never returns empty text on any path', async () => {
    const provider = createProvider({ client: scriptedClient(['']) });

    const result = await generateSummary({ provider, facts: FACTS, factsNarrative: NARRATIVE });

    expect(result.text.length).toBeGreaterThan(0);
  });
});
