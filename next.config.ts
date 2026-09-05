import type { NextConfig } from 'next';

/**
 * Security headers.
 *
 * The Content-Security-Policy is the load-bearing one. This app renders text that a user
 * pasted — React escapes it, but a CSP means a hypothetical escaping bug cannot become
 * script execution.
 *
 * `'unsafe-inline'` on style-src is required: Next injects inline styles, and Tailwind's
 * runtime does too. It is stated here rather than left for a reviewer to find and wonder
 * about. `script-src` deliberately does NOT allow `'unsafe-inline'` in production.
 *
 * Development needs `'unsafe-eval'` for React Fast Refresh, so the policy is loosened only
 * when NODE_ENV is development. Production gets the strict version.
 */
const isDev = process.env.NODE_ENV === 'development';

const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-inline'";

const contentSecurityPolicy = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  // The only outbound call is server-side to Gemini, so the browser needs nothing.
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  // Redundant with frame-ancestors for modern browsers; kept for older ones.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nothing here needs a camera, microphone or location.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Deliberately NOT setting typescript.ignoreBuildErrors or eslint.ignoreDuringBuilds.
  // A failing typecheck must fail the build (CLAUDE.md rule 1).

  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
};

export { contentSecurityPolicy, securityHeaders };
export default nextConfig;
