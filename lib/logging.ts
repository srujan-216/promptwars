/**
 * Logging, with PHI redaction (CLAUDE.md rule 8).
 *
 * This existed as a documented gap for most of the build: rule 8 held only because nothing
 * logged at all. That was defensible until a production failure proved undiagnosable — the
 * live deployment returned 422 on every extraction and the function logs were empty, so
 * there was no way to tell an API rejection from malformed model output.
 *
 * The rule the design follows: log what WE control, never what the user or an upstream
 * service supplied. Error codes, stage names and counts are ours. Document text is the
 * patient's. Upstream error messages are neither, so they are treated as untrusted.
 */

/** Fields whose values must never appear in a log line. */
const SENSITIVE_KEYS = [
  'documentText',
  'previousDocumentText',
  'sourceQuote',
  'quote',
  'prompt',
  'intake',
  'identifier',
  'notes',
  'apiKey',
  'GEMINI_API_KEY',
];

const REDACTED = '[redacted]';

/**
 * Replace anything that could carry PHI or a secret.
 *
 * Deliberately blunt: a key whose NAME matches is redacted whatever it contains, rather
 * than trying to detect PHI by inspecting values. Detection would fail open — an unusual
 * value that no heuristic recognises would be logged — and failing open is the wrong
 * direction for patient data.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return REDACTED;

  if (typeof value === 'string') {
    // A bare string reaching here has no field name to judge it by, so length is the only
    // available signal. Anything long enough to be a document is not logged.
    return value.length > 200 ? `${REDACTED} (${String(value.length)} chars)` : value;
  }

  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.length > 20
      ? `${REDACTED} (array of ${String(value.length)})`
      : value.map((item) => redact(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE_KEYS.includes(key) ? REDACTED : redact(item, depth + 1);
  }
  return out;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function configuredLevel(): LogLevel {
  const raw = process.env['LOG_LEVEL'];
  return raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error' ? raw : 'info';
}

export function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[configuredLevel()];
}

/** Structured log line. Context is redacted before it is written. */
export function log(level: LogLevel, event: string, context: Record<string, unknown> = {}): void {
  if (!shouldLog(level)) return;

  const line = JSON.stringify({ level, event, ...(redact(context) as Record<string, unknown>) });

  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

/**
 * Describe an error for a log line, without trusting its message.
 *
 * An upstream SDK's error text is written by someone else and could echo part of the
 * request, so it is included ONLY at debug level and truncated. `name` and `code` are ours
 * and are always safe.
 */
export function describeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { errorType: typeof error };
  }

  const described: Record<string, unknown> = { name: error.name };

  if ('code' in error && typeof error.code === 'string') {
    described['code'] = error.code;
  }

  // Upstream text is untrusted: opt-in, and truncated even then.
  if (shouldLog('debug')) {
    described['message'] = error.message.slice(0, 300);
  }

  return described;
}
