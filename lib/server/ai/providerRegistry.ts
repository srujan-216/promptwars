import 'server-only';

import {
  createGeminiClient,
  createProvider,
  type Provider,
} from '@/lib/server/ai/provider';
import { createPatternFallbackClient } from '@/lib/server/extraction/fallback';

/**
 * Module-scoped providers, so the response cache OUTLIVES a single request.
 *
 * This exists because of a real bug. `createProvider` used to be called inside the POST
 * handler, which gave every request a fresh, empty cache. The README claimed
 * "re-submitting a document costs zero AI calls"; the test proved it by driving one
 * provider across two pipeline runs, and it held within a request — the comparison
 * extraction and the summary really did share a cache. Across requests it was simply false.
 * Hoisting the providers here makes the claim true where it can be true.
 *
 * WHAT ACTUALLY HOLDS ON SERVERLESS, stated precisely rather than optimistically:
 *
 * Module scope on Vercel lives for the life of one warm instance. So a resubmission served
 * by the same warm instance costs zero calls; one served after a cold start, or routed to a
 * different instance, pays full price. There is no shared cache between instances and this
 * does not pretend to be one. A cross-instance cache needs Redis or similar, which is not
 * built — see the README.
 *
 * The two modes get SEPARATE providers on purpose. The cache key covers model, system
 * instruction, prompt and schema, but not which client produced the answer. One shared cache
 * would let a pattern-matched result be served to a request that should have called Gemini,
 * the moment a key was added to a running instance.
 */

let geminiProvider: Provider | null = null;
let fallbackProvider: Provider | null = null;

export type ProviderMode = 'gemini' | 'pattern_fallback';

export interface SelectedProvider {
  provider: Provider;
  mode: ProviderMode;
}

function hasApiKey(): boolean {
  const key = process.env['GEMINI_API_KEY'];
  return typeof key === 'string' && key !== '';
}

/**
 * The provider for this request. Returns the same instance — and therefore the same warm
 * cache — for every request handled by this instance in the same mode.
 */
export function getProvider(): SelectedProvider {
  if (hasApiKey()) {
    geminiProvider ??= createProvider({ client: createGeminiClient() });
    return { provider: geminiProvider, mode: 'gemini' };
  }

  fallbackProvider ??= createProvider({ client: createPatternFallbackClient() });
  return { provider: fallbackProvider, mode: 'pattern_fallback' };
}

/** Cache occupancy, for tests and for reasoning about memory. */
export function cacheStats(): { gemini: number; fallback: number } {
  return {
    gemini: geminiProvider?.cacheSize() ?? 0,
    fallback: fallbackProvider?.cacheSize() ?? 0,
  };
}

/**
 * Drop both providers. Exported for tests, which must not leak cached responses between
 * cases — a module-scoped cache is shared state, and shared state in tests is a bug factory.
 */
export function resetProviders(): void {
  geminiProvider = null;
  fallbackProvider = null;
}
