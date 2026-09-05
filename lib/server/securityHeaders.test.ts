import { describe, expect, it } from 'vitest';

import { contentSecurityPolicy, securityHeaders } from '../../next.config';

/**
 * These assert the shape of the policy, not that a browser enforces it — that needs a real
 * browser. What they catch is the realistic regression: someone loosening the policy to make
 * something work and nobody noticing.
 */

function directive(name: string): string {
  const found = contentSecurityPolicy.split('; ').find((part) => part.startsWith(`${name} `));
  return found ?? '';
}

describe('Content-Security-Policy', () => {
  it('defaults to self', () => {
    expect(directive('default-src')).toBe("default-src 'self'");
  });

  it('forbids framing entirely', () => {
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
  });

  it('forbids plugins', () => {
    expect(directive('object-src')).toBe("object-src 'none'");
  });

  it('restricts form submissions to this origin', () => {
    expect(directive('form-action')).toBe("form-action 'self'");
  });

  it('does not allow unsafe-eval in production', () => {
    // Development needs it for Fast Refresh; the built artefact must not.
    expect(directive('script-src')).not.toContain('unsafe-eval');
  });

  it('does not permit arbitrary outbound connections from the browser', () => {
    // The only network call is server-side to Gemini. The browser needs nothing.
    expect(directive('connect-src')).toBe("connect-src 'self'");
  });

  it('pins base-uri, so an injected <base> cannot redirect relative URLs', () => {
    expect(directive('base-uri')).toBe("base-uri 'self'");
  });
});

describe('security headers', () => {
  it.each([
    'Content-Security-Policy',
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ])('sets %s', (name) => {
    expect(securityHeaders.some((header) => header.key === name)).toBe(true);
  });

  it('forbids MIME sniffing', () => {
    expect(securityHeaders.find((h) => h.key === 'X-Content-Type-Options')?.value).toBe(
      'nosniff',
    );
  });

  it('does not leak full URLs to other origins', () => {
    expect(securityHeaders.find((h) => h.key === 'Referrer-Policy')?.value).toBe(
      'strict-origin-when-cross-origin',
    );
  });

  it('denies camera, microphone and geolocation', () => {
    const value = securityHeaders.find((h) => h.key === 'Permissions-Policy')?.value ?? '';

    expect(value).toContain('camera=()');
    expect(value).toContain('microphone=()');
    expect(value).toContain('geolocation=()');
  });
});
