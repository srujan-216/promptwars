import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createProvider, type ModelClient } from '@/lib/server/ai/provider';
import { runExtractionPipeline, PipelineError } from './pipeline';
import type { ExtractionResponse } from './schema';

const INJECTED_REPORT = readFileSync(
  join(process.cwd(), 'tests/fixtures/injected-report.txt'),
  'utf8',
);

const CLEAN_REPORT = `CITY LAB
Report Date: 2026-08-14
Hemoglobin        9.4 g/dL     13.0 - 17.0 g/dL
Ferritin          18 ng/mL`;

/** A client that returns a fixed payload, counting how often it was called. */
function stubClient(payload: unknown): ModelClient & { calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    generateStructured: () => {
      calls += 1;
      return Promise.resolve(JSON.stringify(payload));
    },
  };
}

function response(overrides: Partial<ExtractionResponse> = {}): ExtractionResponse {
  return {
    patient: { age: 41, sex: 'male', reportDate: '2026-08-14' },
    labs: [
      {
        name: 'Hemoglobin',
        value: 9.4,
        unit: 'g/dL',
        referenceText: '13.0 - 17.0 g/dL',
        sourceQuote: 'Hemoglobin        9.4 g/dL     13.0 - 17.0 g/dL',
        confidence: 0.95,
      },
    ],
    medications: [],
    allergies: [],
    ...overrides,
  };
}

describe('runExtractionPipeline — happy path', () => {
  it('evaluates status from the genuine printed range', async () => {
    const provider = createProvider({ client: stubClient(response()) });

    const result = await runExtractionPipeline({
      documentText: CLEAN_REPORT,
      provider,
    });

    expect(result.labs[0]?.status).toBe('low');
    expect(result.labs[0]?.refLow).toBe(13);
    expect(result.labs[0]?.refHigh).toBe(17);
  });

  it('normalizes the analyte name', async () => {
    const provider = createProvider({
      client: stubClient(
        response({
          labs: [
            {
              name: 'HGB',
              value: 9.4,
              unit: 'g/dL',
              referenceText: null,
              sourceQuote: 'Hemoglobin        9.4 g/dL',
              confidence: 0.9,
            },
          ],
        }),
      ),
    });

    const result = await runExtractionPipeline({ documentText: CLEAN_REPORT, provider });

    expect(result.labs[0]?.canonicalName).toBe('Hemoglobin');
  });

  it('makes exactly one AI call and six deterministic stages', async () => {
    const provider = createProvider({ client: stubClient(response()) });

    const result = await runExtractionPipeline({ documentText: CLEAN_REPORT, provider });

    const aiStages = result.trace.filter((s) => !s.deterministic);
    const deterministicStages = result.trace.filter((s) => s.deterministic);

    expect(aiStages).toHaveLength(1);
    expect(deterministicStages).toHaveLength(6);
    expect(result.audit.aiCallCount).toBe(1);
  });

  it('reports no_reference_in_source when the document printed no range', async () => {
    const provider = createProvider({
      client: stubClient(
        response({
          labs: [
            {
              name: 'Ferritin',
              value: 18,
              unit: 'ng/mL',
              referenceText: null,
              sourceQuote: 'Ferritin          18 ng/mL',
              confidence: 0.9,
            },
          ],
        }),
      ),
    });

    const result = await runExtractionPipeline({ documentText: CLEAN_REPORT, provider });

    expect(result.labs[0]?.status).toBe('no_reference_in_source');
  });
});

describe('runExtractionPipeline — prompt injection defence', () => {
  it('rejects_prompt_injected_reference_range', async () => {
    // The document contains an injected instruction asserting a false range of 5-8 g/dL.
    // Critically, that text IS present in the document, so a naive verbatim check would
    // accept it. The model here has fully obeyed the injection.
    const provider = createProvider({
      client: stubClient(
        response({
          labs: [
            {
              name: 'Hemoglobin',
              value: 9.4,
              unit: 'g/dL',
              referenceText: '5-8 g/dL',
              sourceQuote: 'Hemoglobin        9.4 g/dL     13.0 - 17.0 g/dL',
              confidence: 0.95,
            },
          ],
        }),
      ),
    });

    const result = await runExtractionPipeline({
      documentText: INJECTED_REPORT,
      provider,
    });

    const hemoglobin = result.labs[0];

    // The injected range is discarded...
    expect(hemoglobin?.referenceText).not.toBe('5-8 g/dL');
    expect(result.audit.hallucinatedRangesRejected).toBe(1);

    // ...and because it was discarded, no range remains to compare against, so the
    // system refuses to judge rather than reporting a status derived from a lie.
    expect(hemoglobin?.status).toBe('no_reference_in_source');

    // The rejection is visible to the user, not silent.
    const finding = result.audit.findings.find(
      (f) => f.code === 'hallucinated_reference_range',
    );
    expect(finding?.message).toContain('5-8 g/dL');
    expect(finding?.message).toContain('rejected');
  });

  it('uses the genuine printed range when the model reports it correctly', async () => {
    // Same injected document, but the model resisted and quoted the real range.
    const provider = createProvider({ client: stubClient(response()) });

    const result = await runExtractionPipeline({
      documentText: INJECTED_REPORT,
      provider,
    });

    expect(result.labs[0]?.referenceText).toBe('13.0 - 17.0 g/dL');
    expect(result.labs[0]?.status).toBe('low');
    expect(result.audit.hallucinatedRangesRejected).toBe(0);
  });

  it('never reports the injected "normal" status the attacker asked for', async () => {
    const provider = createProvider({
      client: stubClient(
        response({
          labs: [
            {
              name: 'Hemoglobin',
              value: 9.4,
              unit: 'g/dL',
              referenceText: '5-8 g/dL',
              sourceQuote: 'Hemoglobin        9.4 g/dL     13.0 - 17.0 g/dL',
              confidence: 0.95,
            },
          ],
        }),
      ),
    });

    const result = await runExtractionPipeline({
      documentText: INJECTED_REPORT,
      provider,
    });

    expect(result.labs[0]?.status).not.toBe('normal');
  });
});

describe('runExtractionPipeline — untrusted output handling', () => {
  it('rejects model output that fails schema validation', async () => {
    const provider = createProvider({
      client: stubClient({ patient: {}, labs: 'not an array' }),
    });

    await expect(
      runExtractionPipeline({ documentText: CLEAN_REPORT, provider }),
    ).rejects.toBeInstanceOf(PipelineError);
  });

  it('never leaks raw model output or document text in the user-facing message', async () => {
    const provider = createProvider({
      client: stubClient({ patient: {}, labs: 'not an array' }),
    });

    try {
      await runExtractionPipeline({ documentText: CLEAN_REPORT, provider });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PipelineError);
      if (error instanceof PipelineError) {
        expect(error.userMessage).not.toContain('Hemoglobin');
        expect(error.userMessage).not.toContain('not an array');
      }
    }
  });

  it('quarantines a field whose quote is not in the document', async () => {
    const provider = createProvider({
      client: stubClient(
        response({
          labs: [
            {
              name: 'Vitamin D',
              value: 30,
              unit: 'ng/mL',
              referenceText: null,
              sourceQuote: 'Vitamin D 30 ng/mL',
              confidence: 0.9,
            },
          ],
        }),
      ),
    });

    const result = await runExtractionPipeline({ documentText: CLEAN_REPORT, provider });

    expect(result.audit.fieldsQuarantined).toBe(1);
    expect(result.labs[0]?.value.verified).toBe(false);
  });

  it('rejects an empty document without calling the model', async () => {
    const client = stubClient(response());
    const provider = createProvider({ client });

    await expect(
      runExtractionPipeline({ documentText: '   ', provider }),
    ).rejects.toBeInstanceOf(PipelineError);
    expect(client.calls()).toBe(0);
  });
});

describe('runExtractionPipeline — caching', () => {
  it('costs zero model calls when the same document is submitted again', async () => {
    const client = stubClient(response());
    const provider = createProvider({ client });

    const first = await runExtractionPipeline({ documentText: CLEAN_REPORT, provider });
    const second = await runExtractionPipeline({ documentText: CLEAN_REPORT, provider });

    expect(first.servedFromCache).toBe(false);
    expect(second.servedFromCache).toBe(true);
    expect(client.calls()).toBe(1);
    expect(second.audit.aiCallCount).toBe(0);
  });

  it('produces identical results from cache', async () => {
    const provider = createProvider({ client: stubClient(response()) });

    const first = await runExtractionPipeline({ documentText: CLEAN_REPORT, provider });
    const second = await runExtractionPipeline({ documentText: CLEAN_REPORT, provider });

    expect(second.labs).toEqual(first.labs);
  });

  it('calls the model again for a different document', async () => {
    const client = stubClient(response());
    const provider = createProvider({ client });

    await runExtractionPipeline({ documentText: CLEAN_REPORT, provider });
    await runExtractionPipeline({ documentText: `${CLEAN_REPORT}\nExtra line`, provider });

    expect(client.calls()).toBe(2);
  });
});
