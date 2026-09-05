import { describe, expect, it } from 'vitest';

import { EnvValidationError, parseEnv, parseServerEnv } from './env';

describe('parseEnv', () => {
  it('applies defaults when nothing is supplied', () => {
    const parsed = parseEnv({});

    expect(parsed.NODE_ENV).toBe('development');
    expect(parsed.APP_ENV).toBe('local');
    expect(parsed.PORT).toBe(3000);
    expect(parsed.LOG_LEVEL).toBe('info');
  });

  it('coerces PORT from the string the platform actually supplies', () => {
    expect(parseEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejects a PORT outside the valid range instead of clamping it', () => {
    expect(() => parseEnv({ PORT: '70000' })).toThrow(EnvValidationError);
  });

  it('rejects an unknown APP_ENV', () => {
    expect(() => parseEnv({ APP_ENV: 'staging' })).toThrow(EnvValidationError);
  });

  it('leaves GIT_SHA undefined rather than substituting a placeholder', () => {
    expect(parseEnv({}).GIT_SHA).toBeUndefined();
  });

  it('names the offending variable in the error message', () => {
    expect(() => parseEnv({ LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });
});

describe('parseServerEnv', () => {
  it('accepts a plausible key', () => {
    const key = 'AIzaSyDummyKeyForTestingOnly1234';

    expect(parseServerEnv({ GEMINI_API_KEY: key }).GEMINI_API_KEY).toBe(key);
  });

  it('throws when GEMINI_API_KEY is absent', () => {
    expect(() => parseServerEnv({})).toThrow(EnvValidationError);
  });

  it('rejects a key too short to be real rather than accepting a placeholder', () => {
    expect(() => parseServerEnv({ GEMINI_API_KEY: 'todo' })).toThrow(EnvValidationError);
  });

  it('never echoes the key value in the error message', () => {
    const secret = 'short-but-secret';
    let message: string | null = null;

    try {
      parseServerEnv({ GEMINI_API_KEY: secret });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).not.toBeNull();
    expect(message).toContain('GEMINI_API_KEY');
    expect(message).not.toContain(secret);
  });
});
