/**
 * Test stub for the `server-only` package.
 *
 * The real package throws on import so that server code cannot be pulled into a client
 * bundle. Vitest resolves it through the browser condition and would trip that guard on
 * every server module we unit-test, so tests alias it here (see vitest.config.ts).
 *
 * This does NOT weaken the guard in the app: Next resolves the real, throwing entry, so
 * a client component importing lib/server/** is still a build error. The ESLint
 * no-restricted-imports rule covers the same ground independently.
 */
export {};
