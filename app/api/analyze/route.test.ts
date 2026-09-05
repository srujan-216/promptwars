import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetProviders } from '@/lib/server/ai/providerRegistry';
import { analyzeRateLimiter } from '@/lib/server/rateLimit';

/**
 * The route handler, exercised THROUGH rather than around.
 *
 * This seam was untested until now, and its absence is why the per-request cache bug
 * survived: every layer around POST was tested, and the composition was not. The
 * `serves the second submission from cache` case below is exactly the assertion that would
 * have failed against the old code.
 *
 * With no GEMINI_API_KEY these tests exercise the real registry, the real pipeline and the
 * real pattern-matching extractor — no network, no mocks. Only the provider-failure case
 * mocks anything, because a failing model cannot be produced honestly any other way.
 */

const REPORT = `CITY DIAGNOSTIC LABORATORY
Report Date: 2026-08-14
Hemoglobin        11.2 g/dL     13.0 - 17.0 g/dL
Ferritin          18 ng/mL`;

function post(body: unknown, raw?: string): Request {
  return new Request('http://localhost/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  const parsed: unknown = await response.json();
  if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
  return { ...parsed };
}

beforeEach(() => {
  delete process.env['GEMINI_API_KEY'];
  resetProviders();
  analyzeRateLimiter.reset();
});

afterEach(() => {
  resetProviders();
  // doMock registrations survive resetModules, so an un-mock is required or the
  // provider-failure stub leaks into every later case in this file.
  vi.doUnmock('@/lib/server/ai/providerRegistry');
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('POST /api/analyze — a valid submission, end to end', () => {
  it('returns 200', async () => {
    const { POST } = await import('./route');

    expect((await POST(post({ documentText: REPORT }))).status).toBe(200);
  });

  it('reports the pattern fallback mode when no key is configured', async () => {
    const { POST } = await import('./route');

    const body = await json(await POST(post({ documentText: REPORT })));

    expect(body['mode']).toBe('pattern_fallback');
  });

  it('returns a verified record with an evaluated status', async () => {
    const { POST } = await import('./route');

    const body = await json(await POST(post({ documentText: REPORT })));
    const record = body['record'] as { labs: { canonicalName: string; status: string }[] };

    expect(record.labs.find((l) => l.canonicalName === 'Hemoglobin')?.status).toBe('low');
  });

  it('returns no_reference_in_source where the document printed no range', async () => {
    const { POST } = await import('./route');

    const body = await json(await POST(post({ documentText: REPORT })));
    const record = body['record'] as { labs: { canonicalName: string; status: string }[] };

    expect(record.labs.find((l) => l.canonicalName === 'Ferritin')?.status).toBe(
      'no_reference_in_source',
    );
  });

  it('generates no summary without a key, rather than fabricating one', async () => {
    const { POST } = await import('./route');

    const body = await json(await POST(post({ documentText: REPORT })));

    expect(body['summary']).toBeNull();
  });

  it('merges user intake into the record as user_provided', async () => {
    const { POST } = await import('./route');

    const body = await json(
      await POST(
        post({
          documentText: REPORT,
          intake: {
            identifier: 'AB-1',
            age: 34,
            sex: 'female',
            symptoms: [],
            conditions: [],
            allergies: [],
            noKnownAllergies: false,
            medications: [],
            notes: '',
          },
        }),
      ),
    );

    const record = body['record'] as { patientInformation: { value: string; origin: string }[] };
    const age = record.patientInformation.find((f) => f.value === '34');

    expect(age?.origin).toBe('user_provided');
  });
});

describe('POST /api/analyze — rejected input', () => {
  it('returns 400 for a body that is not JSON', async () => {
    const { POST } = await import('./route');

    const response = await POST(post(null, 'not json at all'));

    expect(response.status).toBe(400);
    expect((await json(response))['error']).toMatch(/could not be read as JSON/);
  });

  it('returns 400 when documentText is missing', async () => {
    const { POST } = await import('./route');

    expect((await POST(post({}))).status).toBe(400);
  });

  it('returns 400 for an empty document', async () => {
    const { POST } = await import('./route');

    const response = await POST(post({ documentText: '' }));

    expect(response.status).toBe(400);
    expect((await json(response))['error']).toMatch(/Paste a report/);
  });

  it('returns 400 for an oversized document', async () => {
    const { POST } = await import('./route');

    const response = await POST(post({ documentText: 'x'.repeat(100_001) }));

    expect(response.status).toBe(400);
    expect((await json(response))['error']).toMatch(/too large/);
  });

  it('accepts a document exactly at the limit', async () => {
    const { POST } = await import('./route');

    const atLimit = `${REPORT}\n${'x'.repeat(100_000 - REPORT.length - 1)}`;

    expect((await POST(post({ documentText: atLimit }))).status).toBe(200);
  });

  it('returns 400 for intake that fails the shared schema', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      post({
        documentText: REPORT,
        intake: {
          identifier: '',
          age: 500,
          sex: null,
          symptoms: [],
          conditions: [],
          allergies: [],
          noKnownAllergies: false,
          medications: [],
          notes: '',
        },
      }),
    );

    expect(response.status).toBe(400);
  });

  it('never echoes the submitted document back in an error', async () => {
    const { POST } = await import('./route');

    const response = await POST(post({ documentText: 'x'.repeat(100_001) }));

    expect(JSON.stringify(await json(response))).not.toContain('xxxxx');
  });
});

describe('POST /api/analyze — provider failure', () => {
  it('surfaces a model failure as 422, not 500', async () => {
    vi.doMock('@/lib/server/ai/providerRegistry', () => ({
      getProvider: () => ({
        mode: 'pattern_fallback' as const,
        provider: {
          generate: () => Promise.reject(new Error('upstream exploded')),
          cacheSize: () => 0,
          totalCalls: () => 0,
          clearCache: () => undefined,
        },
      }),
      resetProviders: () => undefined,
      cacheStats: () => ({ gemini: 0, fallback: 0 }),
    }));

    const { POST } = await import('./route');
    const response = await POST(post({ documentText: REPORT }));

    expect(response.status).toBe(422);
  });

  it('returns a user-safe message, never the technical cause', async () => {
    vi.doMock('@/lib/server/ai/providerRegistry', () => ({
      getProvider: () => ({
        mode: 'pattern_fallback' as const,
        provider: {
          generate: () => Promise.reject(new Error('upstream exploded')),
          cacheSize: () => 0,
          totalCalls: () => 0,
          clearCache: () => undefined,
        },
      }),
      resetProviders: () => undefined,
      cacheStats: () => ({ gemini: 0, fallback: 0 }),
    }));

    const { POST } = await import('./route');
    const body = await json(await POST(post({ documentText: REPORT })));

    expect(body['error']).toBe('The document could not be read. Please check it and try again.');
    expect(JSON.stringify(body)).not.toContain('upstream exploded');
  });
});

describe('POST /api/analyze — the cache survives between requests', () => {
  /**
   * The regression test for the bug this suite was written to catch. Against the old code,
   * where createProvider ran inside the handler, `servedFromCache` was false on both calls.
   */
  it('serves the second submission from cache', async () => {
    const { POST } = await import('./route');

    const first = await json(await POST(post({ documentText: REPORT })));
    const second = await json(await POST(post({ documentText: REPORT })));

    expect(first['servedFromCache']).toBe(false);
    expect(second['servedFromCache']).toBe(true);
  });

  it('reports zero AI calls on the cached submission', async () => {
    const { POST } = await import('./route');

    await POST(post({ documentText: REPORT }));
    const second = await json(await POST(post({ documentText: REPORT })));
    const audit = second['audit'] as { aiCallCount: number };

    expect(audit.aiCallCount).toBe(0);
  });

  it('does not serve a different document from cache', async () => {
    const { POST } = await import('./route');

    await POST(post({ documentText: REPORT }));
    const other = await json(await POST(post({ documentText: `${REPORT}\nPlatelet  200 x` })));

    expect(other['servedFromCache']).toBe(false);
  });

  it('starts cold again after a reset', async () => {
    // Both imports must come from the same module graph. vi.resetModules() gives the
    // dynamically-imported route a fresh registry instance, so the statically-imported
    // resetProviders at the top of this file would reset a different one and do nothing.
    const { POST } = await import('./route');
    const { resetProviders: resetSameGraph } = await import(
      '@/lib/server/ai/providerRegistry'
    );

    await POST(post({ documentText: REPORT }));
    resetSameGraph();
    const afterColdStart = await json(await POST(post({ documentText: REPORT })));

    expect(afterColdStart['servedFromCache']).toBe(false);
  });
});

describe('POST /api/analyze — a cached fallback result never serves a Gemini request', () => {
  it('switches provider when a key appears, so the pattern-matched cache is not reused', async () => {
    const { getProvider } = await import('@/lib/server/ai/providerRegistry');
    const { POST } = await import('./route');

    // Warm the fallback cache through the real handler.
    await POST(post({ documentText: REPORT }));
    const fallback = getProvider();
    expect(fallback.mode).toBe('pattern_fallback');
    expect(fallback.provider.cacheSize()).toBeGreaterThan(0);

    // A key appears on the running instance.
    process.env['GEMINI_API_KEY'] = 'AIzaSyDummyKeyForTestingOnly1234';
    const gemini = getProvider();

    // Different provider, and its cache is empty — so nothing the pattern matcher produced
    // can be handed to a request that should have called the model.
    expect(gemini.mode).toBe('gemini');
    expect(gemini.provider).not.toBe(fallback.provider);
    expect(gemini.provider.cacheSize()).toBe(0);
  });
});

describe('POST /api/analyze — rate limiting', () => {
  it('allows requests up to the limit', async () => {
    const { POST } = await import('./route');

    for (let i = 0; i < 10; i += 1) {
      const response = await POST(post({ documentText: REPORT }));
      expect(response.status).toBe(200);
    }
  });

  it('returns 429 once the limit is exceeded', async () => {
    const { POST } = await import('./route');
    const { analyzeRateLimiter: limiter } = await import('@/lib/server/rateLimit');
    limiter.reset();

    for (let i = 0; i < 10; i += 1) await POST(post({ documentText: REPORT }));
    const blocked = await POST(post({ documentText: REPORT }));

    expect(blocked.status).toBe(429);
  });

  it('sets Retry-After so a client knows when to come back', async () => {
    const { POST } = await import('./route');
    const { analyzeRateLimiter: limiter } = await import('@/lib/server/rateLimit');
    limiter.reset();

    for (let i = 0; i < 10; i += 1) await POST(post({ documentText: REPORT }));
    const blocked = await POST(post({ documentText: REPORT }));

    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('gives a plain-language message, not a stack trace', async () => {
    const { POST } = await import('./route');
    const { analyzeRateLimiter: limiter } = await import('@/lib/server/rateLimit');
    limiter.reset();

    for (let i = 0; i < 10; i += 1) await POST(post({ documentText: REPORT }));
    const body = await json(await POST(post({ documentText: REPORT })));

    expect(body['error']).toBe('Too many requests. Please wait a moment and try again.');
  });

  it('limits per client, so one caller cannot lock out another', async () => {
    const { POST } = await import('./route');
    const { analyzeRateLimiter: limiter } = await import('@/lib/server/rateLimit');
    limiter.reset();

    const noisy = (): Request =>
      new Request('http://localhost/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.1' },
        body: JSON.stringify({ documentText: REPORT }),
      });

    for (let i = 0; i < 11; i += 1) await POST(noisy());

    const other = new Request('http://localhost/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '2.2.2.2' },
      body: JSON.stringify({ documentText: REPORT }),
    });

    expect((await POST(other)).status).toBe(200);
  });

  it('rejects before parsing the body, so a blocked request costs nothing', async () => {
    const { POST } = await import('./route');
    const { analyzeRateLimiter: limiter } = await import('@/lib/server/rateLimit');
    limiter.reset();

    for (let i = 0; i < 10; i += 1) await POST(post({ documentText: REPORT }));

    // Malformed body that would otherwise 400: the 429 must win, proving the limiter
    // runs first and an abusive caller cannot make us do parsing work.
    const blocked = await POST(post(null, 'not json at all'));

    expect(blocked.status).toBe(429);
  });
});
