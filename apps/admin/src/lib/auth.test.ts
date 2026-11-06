import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseStatus } from './status.ts';

test('only the two known statuses are trusted, everything else is "not an admin"', () => {
  assert.equal(parseStatus('verified'), 'verified');
  assert.equal(parseStatus('needs_code'), 'needs_code');
  for (const v of [null, undefined, '', 'VERIFIED', 'admin', 1, true, {}, ['verified']]) assert.equal(parseStatus(v), 'not_admin');
});
