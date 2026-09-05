import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { describeError, log, redact, shouldLog } from './logging';

const ORIGINAL_LEVEL = process.env['LOG_LEVEL'];

beforeEach(() => {
  delete process.env['LOG_LEVEL'];
});

afterEach(() => {
  if (ORIGINAL_LEVEL === undefined) delete process.env['LOG_LEVEL'];
  else process.env['LOG_LEVEL'] = ORIGINAL_LEVEL;
  vi.restoreAllMocks();
});

describe('redact — PHI never reaches a log', () => {
  it.each([
    'documentText',
    'previousDocumentText',
    'sourceQuote',
    'prompt',
    'intake',
    'identifier',
    'notes',
    'apiKey',
    'GEMINI_API_KEY',
  ])('redacts %s by name, whatever it contains', (key) => {
    const out = redact({ [key]: 'Hemoglobin 11.2 g/dL, patient Jane Doe' });

    expect(JSON.stringify(out)).not.toContain('Jane Doe');
    expect(JSON.stringify(out)).toContain('[redacted]');
  });

  it('redacts by field name rather than by inspecting the value', () => {
    // Detection heuristics fail open: an unusual value nothing recognises gets logged.
    // Redacting on the key name fails closed, which is the right direction for PHI.
    const out = redact({ documentText: 'x' });

    expect(out).toEqual({ documentText: '[redacted]' });
  });

  it('redacts a long bare string, which has no field name to judge it by', () => {
    const out = redact('y'.repeat(500));

    expect(out).toBe('[redacted] (500 chars)');
  });

  it('keeps short, safe values readable', () => {
    expect(redact({ mode: 'gemini', code: 'invalid_json' })).toEqual({
      mode: 'gemini',
      code: 'invalid_json',
    });
  });

  it('redacts nested sensitive fields', () => {
    const out = redact({ request: { body: { documentText: 'secret report' } } });

    expect(JSON.stringify(out)).not.toContain('secret report');
  });

  it('summarises a long array rather than logging its contents', () => {
    const out = redact(Array.from({ length: 50 }, () => 'lab result'));

    expect(out).toBe('[redacted] (array of 50)');
  });

  it('stops recursing on deeply nested input', () => {
    let nested: Record<string, unknown> = { documentText: 'deep' };
    for (let i = 0; i < 12; i += 1) nested = { inner: nested };

    expect(JSON.stringify(redact(nested))).not.toContain('deep');
  });

  it('leaves primitives alone', () => {
    expect(redact(42)).toBe(42);
    expect(redact(true)).toBe(true);
    expect(redact(null)).toBeNull();
  });
});

describe('describeError — upstream text is untrusted', () => {
  it('always reports the error name', () => {
    expect(describeError(new Error('boom'))['name']).toBe('Error');
  });

  it('reports a code when the error carries one', () => {
    const error = Object.assign(new Error('x'), { code: 'invalid_json' });

    expect(describeError(error)['code']).toBe('invalid_json');
  });

  it('omits the upstream message at the default level', () => {
    // An SDK's error text is written by someone else and could echo the request.
    expect(describeError(new Error('echoed document content'))['message']).toBeUndefined();
  });

  it('includes a truncated message only at debug level', () => {
    process.env['LOG_LEVEL'] = 'debug';

    const described = describeError(new Error('z'.repeat(500)));

    expect(String(described['message'])).toHaveLength(300);
  });

  it('handles a non-Error throw', () => {
    expect(describeError('a string')).toEqual({ errorType: 'string' });
  });
});

describe('log levels', () => {
  it('suppresses debug at the default level', () => {
    expect(shouldLog('debug')).toBe(false);
  });

  it('emits errors at the default level', () => {
    expect(shouldLog('error')).toBe(true);
  });

  it('honours LOG_LEVEL', () => {
    process.env['LOG_LEVEL'] = 'debug';

    expect(shouldLog('debug')).toBe(true);
  });

  it('writes a structured line with the event name', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    log('error', 'extraction_failed', { mode: 'gemini' });

    expect(spy).toHaveBeenCalledOnce();
    const line: unknown = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(line).toEqual({ level: 'error', event: 'extraction_failed', mode: 'gemini' });
  });

  it('redacts context before writing it', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    log('error', 'extraction_failed', { documentText: 'patient Jane Doe' });

    expect(String(spy.mock.calls[0]?.[0])).not.toContain('Jane Doe');
  });

  it('writes nothing when the level is below the threshold', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    log('debug', 'ignored');

    expect(spy).not.toHaveBeenCalled();
  });
});
