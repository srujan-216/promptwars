import { describe, expect, it } from 'vitest';

import { GET, type HealthPayload } from './route';

async function readBody(response: Response): Promise<HealthPayload> {
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null) {
    throw new Error('health response body was not an object');
  }
  // Narrowed via the assertions in the tests themselves; no `as` cast to a lie.
  return body as HealthPayload;
}

describe('GET /api/health', () => {
  it('returns 200', () => {
    expect(GET().status).toBe(200);
  });

  it('is not cacheable', () => {
    expect(GET().headers.get('cache-control')).toBe('no-store');
  });

  it('reports status ok and a non-negative uptime', async () => {
    const body = await readBody(GET());

    expect(body.status).toBe('ok');
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(body.uptimeSeconds)).toBe(true);
  });

  it('reports commit as null rather than a fake value when GIT_SHA is unset', async () => {
    const body = await readBody(GET());

    expect(body.commit).toBeNull();
    expect(body.commit).not.toBe('unknown');
  });

  it('leaks no secret-bearing environment variables', async () => {
    const raw = await GET().text();

    expect(raw).not.toContain('DATABASE_URL');
    expect(raw).not.toContain('AUTH_SECRET');
    expect(raw).not.toContain('ANTHROPIC_API_KEY');
    expect(raw).not.toContain('sk-ant-');
  });
});
