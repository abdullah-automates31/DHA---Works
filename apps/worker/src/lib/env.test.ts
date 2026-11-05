import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isAllowedServerUrl } from './env.ts';

test('a release build accepts https only', () => {
  assert.equal(isAllowedServerUrl('https://abc.supabase.co', false), true);
  assert.equal(isAllowedServerUrl('http://192.168.1.5:55321', false), false);
  assert.equal(isAllowedServerUrl('ftp://x', false), false);
  assert.equal(isAllowedServerUrl('', false), false);
  assert.equal(isAllowedServerUrl(undefined, false), false);
});

test('development also accepts plain http for the local stack', () => {
  assert.equal(isAllowedServerUrl('http://192.168.1.5:55321', true), true);
  assert.equal(isAllowedServerUrl('https://abc.supabase.co', true), true);
  assert.equal(isAllowedServerUrl('javascript:alert(1)', true), false);
  assert.equal(isAllowedServerUrl(undefined, true), false);
});
