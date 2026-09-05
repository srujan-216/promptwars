import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cacheStats, getProvider, resetProviders } from './providerRegistry';

/**
 * These tests exist because of a real defect.
 *
 * `createProvider` was called inside the POST handler, so every request got an empty cache.
 * The README claimed "re-submitting a document costs zero AI calls" and the existing test
 * proved it — by driving ONE provider across two pipeline runs. That held within a request
 * and was false across requests, which is the shape of bug this project exists to catch.
 *
 * So the property under test is specifically the one that was broken: the cache must
 * outlive a single request.
 */

const REQUEST = {
  systemInstruction: 'transcribe',
  prompt: 'a document',
  responseSchema: { type: 'object' },
};

beforeEach(() => {
  resetProviders();
  delete process.env['GEMINI_API_KEY'];
});

afterEach(() => {
  resetProviders();
});

describe('getProvider — identity', () => {
  it('returns the same provider instance across separate calls', () => {
    // Each call stands in for a separate request handled by the same warm instance.
    expect(getProvider().provider).toBe(getProvider().provider);
  });

  it('reports the pattern fallback mode when no key is configured', () => {
    expect(getProvider().mode).toBe('pattern_fallback');
  });

  it('selects the Gemini provider when a key is present', () => {
    process.env['GEMINI_API_KEY'] = 'AIzaSyDummyKeyForTestingOnly1234';

    expect(getProvider().mode).toBe('gemini');
  });

  it('keeps the two modes in separate caches', () => {
    // A shared cache would let a pattern-matched answer be served to a request that
    // should have called Gemini, the moment a key appeared on a running instance.
    const fallback = getProvider().provider;
    process.env['GEMINI_API_KEY'] = 'AIzaSyDummyKeyForTestingOnly1234';
    const gemini = getProvider().provider;

    expect(gemini).not.toBe(fallback);
  });
});

describe('cache survives across requests', () => {
  it('serves a second request from the cache the first request populated', async () => {
    const first = getProvider().provider;
    await first.generate(REQUEST);

    const callsAfterFirstRequest = first.totalCalls();

    // A separate request: fetch the provider afresh, exactly as the route handler does.
    const second = getProvider().provider;
    const result = await second.generate(REQUEST);

    expect(result.cached).toBe(true);
    expect(result.callCount).toBe(0);
    expect(second.totalCalls()).toBe(callsAfterFirstRequest);
  });

  it('retains the cached entry between calls', async () => {
    await getProvider().provider.generate(REQUEST);

    expect(cacheStats().fallback).toBe(1);

    await getProvider().provider.generate(REQUEST);

    expect(cacheStats().fallback).toBe(1);
  });

  it('still calls for a document it has not seen', async () => {
    const provider = getProvider().provider;
    await provider.generate(REQUEST);
    await provider.generate({ ...REQUEST, prompt: 'a different document' });

    expect(cacheStats().fallback).toBe(2);
  });

  it('starts empty after a reset, which is what a cold start looks like', async () => {
    await getProvider().provider.generate(REQUEST);
    expect(cacheStats().fallback).toBe(1);

    // resetProviders() models a cold start: a new instance, an empty cache. The README
    // says this costs a full call, and this is why.
    resetProviders();

    expect(cacheStats().fallback).toBe(0);
  });
});
