import { z } from 'zod';

/**
 * Environment validation. Every external boundary is Zod-validated, and env vars
 * are an external boundary.
 *
 * Split into two schemas on purpose:
 *
 * - `baseSchema` is parsed eagerly at import. It contains only values that always
 *   have a safe default, so importing this module can never fail a build.
 * - `serverSchema` holds the server-only secret. It is parsed LAZILY by
 *   `getServerEnv()`, because `pnpm build` and CI legitimately have no API key and
 *   must still pass. Any code path that actually talks to the model calls
 *   `getServerEnv()` and fails loudly if the key is absent — no placeholder, no
 *   silent empty string.
 */
const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'ci', 'production']).default('local'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  /** Commit SHA baked in at build time. Absent locally — reported as null, never faked. */
  GIT_SHA: z.string().min(7).optional(),
});

const serverSchema = z.object({
  /** Server-only. Never expose to the client; never log. */
  GEMINI_API_KEY: z.string().min(20, 'GEMINI_API_KEY looks too short to be a real key'),
});

export type Env = z.infer<typeof baseSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

export class EnvValidationError extends Error {
  constructor(issues: string) {
    super(`Invalid environment configuration:\n${issues}`);
    this.name = 'EnvValidationError';
  }
}

/** Format issues without echoing any value — values here are secrets (never log PHI/keys). */
function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
}

/** Pure parse of the always-safe vars. Exported so it is testable without touching process.env. */
export function parseEnv(raw: Readonly<Record<string, string | undefined>>): Env {
  const result = baseSchema.safeParse(raw);
  if (!result.success) {
    throw new EnvValidationError(formatIssues(result.error));
  }
  return result.data;
}

/** Pure parse of the server-only vars. Throws if the key is missing or malformed. */
export function parseServerEnv(raw: Readonly<Record<string, string | undefined>>): ServerEnv {
  const result = serverSchema.safeParse(raw);
  if (!result.success) {
    throw new EnvValidationError(formatIssues(result.error));
  }
  return result.data;
}

export const env: Env = parseEnv(process.env);

/**
 * The commit this build came from.
 *
 * Prefers an explicit GIT_SHA, then Vercel's own VERCEL_GIT_COMMIT_SHA, which the platform
 * sets automatically. Without this there is no way to tell which commit is actually live —
 * a gap that cost real time when a deployed fix could not be distinguished from a stale
 * build. Returns null rather than a placeholder when genuinely unknown.
 */
export function deployedCommit(): string | null {
  const explicit = env.GIT_SHA;
  if (explicit !== undefined) return explicit;

  const vercel = process.env['VERCEL_GIT_COMMIT_SHA'];
  return typeof vercel === 'string' && vercel !== '' ? vercel : null;
}

let cachedServerEnv: ServerEnv | null = null;

/**
 * Lazily validated server-only environment. Call this from server code that needs
 * the model provider. Throws EnvValidationError when GEMINI_API_KEY is absent.
 */
export function getServerEnv(): ServerEnv {
  cachedServerEnv ??= parseServerEnv(process.env);
  return cachedServerEnv;
}
