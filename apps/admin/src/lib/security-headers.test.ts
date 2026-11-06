import assert from 'node:assert/strict';
import { test } from 'node:test';
import { securityHeaders } from './security-headers.ts';

const get = (h: { key: string; value: string }[], k: string) => h.find((x) => x.key === k)?.value ?? '';

test('production headers forbid framing, plugins and foreign origins', () => {
  const h = securityHeaders('https://abc.supabase.co/', false);
  const csp = get(h, 'Content-Security-Policy');
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /form-action 'self'/);
  assert.match(csp, /connect-src 'self' https:\/\/abc\.supabase\.co/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(csp, /ws:/);
  assert.equal(get(h, 'X-Frame-Options'), 'DENY');
  assert.equal(get(h, 'X-Content-Type-Options'), 'nosniff');
  assert.equal(get(h, 'Referrer-Policy'), 'no-referrer');
  assert.match(get(h, 'Strict-Transport-Security'), /max-age=\d{8,}/);
  assert.equal(get(h, 'Cache-Control'), 'no-store');
});

test('development additionally allows eval and websockets for hot reload only', () => {
  const csp = get(securityHeaders('http://127.0.0.1:55321', true), 'Content-Security-Policy');
  assert.match(csp, /unsafe-eval/);
  assert.match(csp, /ws:/);
});

test('a missing or broken Supabase URL never widens the policy', () => {
  for (const bad of ['', 'not a url', '*']) {
    const csp = get(securityHeaders(bad, false), 'Content-Security-Policy');
    assert.doesNotMatch(csp, /\*/);
    assert.match(csp, /img-src 'self' data: blob:;/);
  }
});
