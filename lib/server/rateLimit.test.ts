import { describe, expect, it } from 'vitest';

import { createRateLimiter, identifyClient } from './rateLimit';

const CONFIG = { limit: 3, windowMs: 60_000, maxBuckets: 5 };

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/analyze', { method: 'POST', headers });
}

describe('createRateLimiter', () => {
  it('allows requests up to the limit', () => {
    const limiter = createRateLimiter(CONFIG);

    expect(limiter.check('a', 0).allowed).toBe(true);
    expect(limiter.check('a', 1).allowed).toBe(true);
    expect(limiter.check('a', 2).allowed).toBe(true);
  });

  it('blocks the request past the limit', () => {
    const limiter = createRateLimiter(CONFIG);
    for (const t of [0, 1, 2]) limiter.check('a', t);

    expect(limiter.check('a', 3).allowed).toBe(false);
  });

  it('counts down the remaining allowance', () => {
    const limiter = createRateLimiter(CONFIG);

    expect(limiter.check('a', 0).remaining).toBe(2);
    expect(limiter.check('a', 1).remaining).toBe(1);
    expect(limiter.check('a', 2).remaining).toBe(0);
  });

  it('reports a retry delay when blocked', () => {
    const limiter = createRateLimiter(CONFIG);
    for (const t of [0, 1, 2]) limiter.check('a', t);

    const blocked = limiter.check('a', 3);

    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('opens a fresh window once the old one expires', () => {
    const limiter = createRateLimiter(CONFIG);
    for (const t of [0, 1, 2]) limiter.check('a', t);

    expect(limiter.check('a', 60_000).allowed).toBe(true);
  });

  it('tracks identifiers independently', () => {
    const limiter = createRateLimiter(CONFIG);
    for (const t of [0, 1, 2]) limiter.check('a', t);

    expect(limiter.check('b', 3).allowed).toBe(true);
  });

  it('bounds memory by dropping the oldest buckets', () => {
    const limiter = createRateLimiter(CONFIG);
    for (let i = 0; i < 10; i += 1) limiter.check(`client-${String(i)}`, i);

    expect(limiter.size()).toBeLessThanOrEqual(CONFIG.maxBuckets);
  });

  it('can be reset, which is what a cold start does', () => {
    const limiter = createRateLimiter(CONFIG);
    for (const t of [0, 1, 2]) limiter.check('a', t);
    expect(limiter.check('a', 3).allowed).toBe(false);

    // A cold start wipes the buckets. This is the documented limitation, not a bug.
    limiter.reset();

    expect(limiter.check('a', 4).allowed).toBe(true);
  });
});

describe('identifyClient', () => {
  it('uses the first entry of x-forwarded-for', () => {
    expect(identifyClient(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    expect(identifyClient(req({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('uses a shared bucket when no header is present', () => {
    // Throttling anonymous traffic collectively beats not throttling it.
    expect(identifyClient(req())).toBe('unknown');
  });

  it('prefers x-forwarded-for over x-real-ip', () => {
    expect(identifyClient(req({ 'x-forwarded-for': '1.1.1.1', 'x-real-ip': '2.2.2.2' }))).toBe(
      '1.1.1.1',
    );
  });
});
