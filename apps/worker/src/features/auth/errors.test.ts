import assert from 'node:assert/strict';
import { test } from 'node:test';

import { authErrorKey, isSessionGone } from './errors.ts';

test('rate limits map to tooManyRequests', () => {
  assert.equal(authErrorKey({ code: 'over_sms_send_rate_limit', status: 429 }), 'auth.errors.tooManyRequests');
  assert.equal(authErrorKey({ status: 429 }), 'auth.errors.tooManyRequests');
  assert.equal(authErrorKey({ code: 'over_request_rate_limit' }), 'auth.errors.tooManyRequests');
});

test('a provider failure maps to sendFailed', () => {
  assert.equal(authErrorKey({ code: 'sms_send_failed', status: 500 }), 'auth.errors.sendFailed');
});

test('a wrong or expired code maps to wrongOrExpiredCode', () => {
  assert.equal(authErrorKey({ code: 'otp_expired', status: 403 }), 'auth.errors.wrongOrExpiredCode');
  assert.equal(
    authErrorKey({ message: 'Token has expired or is invalid' }),
    'auth.errors.wrongOrExpiredCode',
  );
});

test('network failures map to network', () => {
  assert.equal(authErrorKey({ name: 'AuthRetryableFetchError', status: 0 }), 'auth.errors.network');
  assert.equal(authErrorKey({ message: 'Network request failed' }), 'auth.errors.network');
});

test('anything else is generic and raw text is never returned', () => {
  assert.equal(authErrorKey({ code: 'unexpected_failure', message: 'secret internals' }), 'auth.errors.generic');
  assert.equal(authErrorKey(null), 'auth.errors.generic');
  assert.equal(authErrorKey(undefined), 'auth.errors.generic');
});

test('a deleted or reset account counts as a gone session; a network failure does not', () => {
  assert.equal(isSessionGone({ code: 'user_not_found', status: 403 }), true);
  assert.equal(isSessionGone({ code: 'session_not_found' }), true);
  assert.equal(isSessionGone({ message: 'User from sub claim in JWT does not exist' }), true);
  assert.equal(isSessionGone({ name: 'AuthRetryableFetchError', status: 0, message: 'Network request failed' }), false);
  assert.equal(isSessionGone({ status: 429, code: 'over_request_rate_limit' }), false);
  assert.equal(isSessionGone(null), false);
});
