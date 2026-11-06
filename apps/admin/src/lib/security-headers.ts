// Response headers for every page (docs/SECURITY.md section 16). Pure, so it is unit tested.
// Known limit: Next.js needs inline scripts for its own bootstrap, so script-src allows 'unsafe-inline' until a
// nonce-based policy is added (tracked in docs/OPEN-QUESTIONS.md). Everything else is locked down:
// no framing, no foreign scripts, forms and requests only to this site and the Supabase project.
export function securityHeaders(supabaseUrl: string, dev: boolean): { key: string; value: string }[] {
  let origin = '';
  try {
    origin = supabaseUrl ? new URL(supabaseUrl).origin : '';
  } catch {
    origin = '';
  }
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${origin ? ` ${origin}` : ''}`,
    `media-src 'self' blob:${origin ? ` ${origin}` : ''}`,
    "font-src 'self'",
    `connect-src 'self'${origin ? ` ${origin}` : ''}${dev ? ' ws:' : ''}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cache-Control', value: 'no-store' },
  ];
}
