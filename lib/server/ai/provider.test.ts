import { describe, expect, it } from 'vitest';

import { ProviderError, cacheKey, createProvider, type ModelClient } from './provider';

const REQUEST = {
  systemInstruction: 'transcribe',
  prompt: 'a document',
  responseSchema: { type: 'object' },
};

function countingClient(response: string): ModelClient & { calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    generateStructured: () => {
      calls += 1;
      return Promise.resolve(response);
    },
  };
}

const noSleep = (): Promise<void> => Promise.resolve();

describe('cacheKey', () => {
  it('is stable for identical requests', () => {
    const request = { ...REQUEST, model: 'gemini-2.0-flash' };

    expect(cacheKey(request)).toBe(cacheKey(request));
  });

  it('differs when the prompt differs', () => {
    expect(cacheKey({ ...REQUEST, model: 'm', prompt: 'a' })).not.toBe(
      cacheKey({ ...REQUEST, model: 'm', prompt: 'b' }),
    );
  });

  it('differs when the schema differs — asking a new question must miss the cache', () => {
    expect(cacheKey({ ...REQUEST, model: 'm', responseSchema: { a: 1 } })).not.toBe(
      cacheKey({ ...REQUEST, model: 'm', responseSchema: { a: 2 } }),
    );
  });

  it('differs when the model differs', () => {
    expect(cacheKey({ ...REQUEST, model: 'a' })).not.toBe(cacheKey({ ...REQUEST, model: 'b' }));
  });
});

describe('createProvider — caching', () => {
  it('serves an identical request from cache at zero cost', async () => {
    const client = countingClient('{"ok":true}');
    const provider = createProvider({ client });

    const first = await provider.generate(REQUEST);
    const second = await provider.generate(REQUEST);

    expect(first.cached).toBe(false);
    expect(first.callCount).toBe(1);
    expect(second.cached).toBe(true);
    expect(second.callCount).toBe(0);
    expect(client.calls()).toBe(1);
  });

  it('returns the same data from cache', async () => {
    const provider = createProvider({ client: countingClient('{"ok":true}') });

    const first = await provider.generate(REQUEST);
    const second = await provider.generate(REQUEST);

    expect(second.data).toEqual(first.data);
  });

  it('calls again for a different prompt', async () => {
    const client = countingClient('{"ok":true}');
    const provider = createProvider({ client });

    await provider.generate(REQUEST);
    await provider.generate({ ...REQUEST, prompt: 'different' });

    expect(client.calls()).toBe(2);
  });

  it('reports cache size and total calls', async () => {
    const provider = createProvider({ client: countingClient('{"ok":true}') });

    await provider.generate(REQUEST);
    await provider.generate(REQUEST);

    expect(provider.cacheSize()).toBe(1);
    expect(provider.totalCalls()).toBe(1);
  });

  it('clears the cache on request', async () => {
    const client = countingClient('{"ok":true}');
    const provider = createProvider({ client });

    await provider.generate(REQUEST);
    provider.clearCache();
    await provider.generate(REQUEST);

    expect(client.calls()).toBe(2);
  });
});

describe('createProvider — failure handling', () => {
  it('retries once on malformed JSON then throws a typed error', async () => {
    const client = countingClient('not json');
    const provider = createProvider({ client, sleep: noSleep });

    await expect(provider.generate(REQUEST)).rejects.toBeInstanceOf(ProviderError);
    expect(client.calls()).toBe(2);
  });

  it('does not cache a failed response', async () => {
    const provider = createProvider({ client: countingClient('not json'), sleep: noSleep });

    await expect(provider.generate(REQUEST)).rejects.toThrow();

    expect(provider.cacheSize()).toBe(0);
  });

  it('reports invalid_json for unparseable output', async () => {
    const provider = createProvider({ client: countingClient('not json'), sleep: noSleep });

    await provider.generate(REQUEST).catch((error: unknown) => {
      expect(error).toBeInstanceOf(ProviderError);
      if (error instanceof ProviderError) expect(error.code).toBe('invalid_json');
    });
  });

  it('reports empty_response for blank output', async () => {
    const provider = createProvider({ client: countingClient('   '), sleep: noSleep });

    await provider.generate(REQUEST).catch((error: unknown) => {
      expect(error).toBeInstanceOf(ProviderError);
      if (error instanceof ProviderError) expect(error.code).toBe('empty_response');
    });
  });

  it('succeeds if the retry works', async () => {
    let calls = 0;
    const provider = createProvider({
      sleep: noSleep,
      client: {
        generateStructured: () => {
          calls += 1;
          return Promise.resolve(calls === 1 ? 'broken' : '{"ok":true}');
        },
      },
    });

    const result = await provider.generate(REQUEST);

    expect(result.data).toEqual({ ok: true });
    expect(result.callCount).toBe(2);
  });

  it('never includes the prompt in the error message', async () => {
    const provider = createProvider({
      sleep: noSleep,
      client: { generateStructured: () => Promise.reject(new Error('upstream 503')) },
    });

    await provider.generate({ ...REQUEST, prompt: 'PATIENT NAME 12345' }).catch((e: unknown) => {
      if (e instanceof Error) expect(e.message).not.toContain('PATIENT NAME');
    });
  });
});
