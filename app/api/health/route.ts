import { deployedCommit, env } from '@/lib/env';

/** Never cache: a health check must report the state of this instance, right now. */
export const dynamic = 'force-dynamic';

export interface HealthPayload {
  status: 'ok';
  appEnv: string;
  /**
   * Real commit SHA baked in at build time, or null when it genuinely is not known.
   * Never the string "unknown" — a health endpoint that lies about its version is
   * indefensible in a project whose whole premise is provenance.
   */
  commit: string | null;
  uptimeSeconds: number;
}

/**
 * Deliberately reports no environment values and no database state. There is no
 * database in Phase 0, and a hardcoded `db: "ok"` would be a placeholder that looks
 * functional — exactly what CLAUDE.md forbids.
 */
export function GET(): Response {
  const payload: HealthPayload = {
    status: 'ok',
    appEnv: env.APP_ENV,
    commit: deployedCommit(),
    uptimeSeconds: Math.round(process.uptime()),
  };

  return Response.json(payload, {
    status: 200,
    headers: { 'cache-control': 'no-store' },
  });
}
