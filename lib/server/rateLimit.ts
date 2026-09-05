import 'server-only';

/**
 * In-memory token bucket for the extraction endpoint.
 *
 * WHAT THIS IS FOR: `/api/analyze` can spend money. On a public deployment with a key
 * configured, an unthrottled endpoint lets anyone burn the quota. This makes that
 * meaningfully harder with no infrastructure.
 *
 * WHAT IT IS NOT, stated plainly rather than left for someone to discover:
 *
 * It is PER INSTANCE. Serverless runs many instances, each with its own buckets, so the
 * effective global limit is roughly (limit × instances) rather than the number below. A
 * cold start resets every bucket. A determined attacker with distributed IPs, or one who
 * simply keeps triggering cold starts, is not stopped by this.
 *
 * It is therefore a speed bump against casual abuse and accidental loops, not a security
 * control. A real limit is shared state — Redis, Upstash, or the platform's own gateway —
 * and is not built here.
 *
 * The identifier is a client-supplied header, which a client can forge. That is inherent to
 * IP-based limiting behind a proxy and is not solved by trying harder in application code.
 */

export interface RateLimitConfig {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Buckets tracked before the oldest are dropped, bounding memory. */
  maxBuckets: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  limit: 10,
  windowMs: 60_000,
  maxBuckets: 1000,
};

export interface RateLimitResult {
  allowed: boolean;
  /** Requests left in the current window. */
  remaining: number;
  /** Seconds until the window resets. Suitable for a Retry-After header. */
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  windowStart: number;
}

export interface RateLimiter {
  check(identifier: string, now?: number): RateLimitResult;
  reset(): void;
  size(): number;
}

export function createRateLimiter(config: RateLimitConfig = DEFAULT_RATE_LIMIT): RateLimiter {
  const { limit, windowMs, maxBuckets } = config;
  const buckets = new Map<string, Bucket>();

  return {
    check(identifier: string, now: number = Date.now()): RateLimitResult {
      const existing = buckets.get(identifier);

      if (existing === undefined || now - existing.windowStart >= windowMs) {
        // Bound memory: Map preserves insertion order, so the first key is the oldest.
        if (buckets.size >= maxBuckets) {
          const oldest = buckets.keys().next();
          if (!oldest.done) buckets.delete(oldest.value);
        }
        buckets.set(identifier, { count: 1, windowStart: now });
        return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
      }

      const elapsed = now - existing.windowStart;
      const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - elapsed) / 1000));

      if (existing.count >= limit) {
        return { allowed: false, remaining: 0, retryAfterSeconds };
      }

      existing.count += 1;
      return { allowed: true, remaining: limit - existing.count, retryAfterSeconds };
    },

    reset(): void {
      buckets.clear();
    },

    size(): number {
      return buckets.size;
    },
  };
}

/**
 * Best-effort client identity from proxy headers.
 *
 * Forgeable by design — see the note above. Falls back to a shared bucket when no header is
 * present, which throttles anonymous traffic collectively rather than not at all.
 */
export function identifyClient(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor !== null && forwardedFor.trim() !== '') {
    // First entry is the originating client; the rest are proxies.
    return forwardedFor.split(',')[0]?.trim() ?? 'unknown';
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp !== null && realIp.trim() !== '') return realIp.trim();

  return 'unknown';
}

/** Module-scoped, so the buckets survive between requests on a warm instance. */
export const analyzeRateLimiter = createRateLimiter();
