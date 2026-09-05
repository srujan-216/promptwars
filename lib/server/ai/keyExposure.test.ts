import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Mechanical guard against leaking the API key to the browser (CLAUDE.md rule 12).
 *
 * `server-only` and the ESLint boundary already make this hard. This test makes it
 * checkable: it walks the source and asserts the key is never exposed through a
 * `NEXT_PUBLIC_` variable, never read outside server code, and never committed literally.
 *
 * It runs in CI, so a future change that quietly moves a key read into a client component
 * fails the build rather than shipping.
 */

const SOURCE_DIRS = ['app', 'components', 'lib'];
const EXTENSIONS = ['.ts', '.tsx'];

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (EXTENSIONS.some((extension) => full.endsWith(extension))) {
      files.push(full);
    }
  }

  return files;
}

/** Test files are excluded: they legitimately contain the very patterns being searched for. */
const sourceFiles = SOURCE_DIRS.flatMap((dir) => walk(join(process.cwd(), dir))).filter(
  (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'),
);

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

describe('API key exposure', () => {
  it('finds source files to check', () => {
    expect(sourceFiles.length).toBeGreaterThan(20);
  });

  it('never exposes the key through a NEXT_PUBLIC_ variable', () => {
    const offenders = sourceFiles.filter((file) => /NEXT_PUBLIC_/.test(read(file)));

    expect(offenders).toEqual([]);
  });

  it('excludes test files from the scan, so the guard is checking real source', () => {
    expect(sourceFiles.every((file) => !file.includes('.test.'))).toBe(true);
  });

  it('reads the key only from server code', () => {
    const readsKeyValue = sourceFiles.filter((file) => {
      const content = read(file);
      // A literal mention in user-facing copy is fine; reading process.env is not.
      return /process\.env\[['"]GEMINI_API_KEY['"]\]|process\.env\.GEMINI_API_KEY/.test(content);
    });

    for (const file of readsKeyValue) {
      const relative = file.replace(process.cwd(), '').replace(/\\/g, '/');
      const isServer =
        relative.includes('/lib/server/') ||
        relative.includes('/lib/env.ts') ||
        relative.includes('/app/api/');

      expect(isServer, `${relative} reads GEMINI_API_KEY outside server code`).toBe(true);
    }
  });

  it('never has a client component read process.env at all', () => {
    const offenders = sourceFiles.filter((file) => {
      const content = read(file);
      return content.includes("'use client'") && /process\.env/.test(content);
    });

    expect(offenders).toEqual([]);
  });

  it('contains no committed key-shaped literal', () => {
    const offenders = sourceFiles.filter((file) => {
      const content = read(file);
      return /AIza[0-9A-Za-z_-]{30,}/.test(content);
    });

    expect(offenders).toEqual([]);
  });
});
