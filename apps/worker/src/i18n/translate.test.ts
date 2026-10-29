import assert from 'node:assert/strict';
import { test } from 'node:test';

import { translate } from './translate.ts';

const messages = { a: { b: 'Hello {name}, you have {n} jobs' }, plain: 'Plain' } as const;

test('returns a plain string', () => {
  assert.equal(translate(messages, 'plain'), 'Plain');
});

test('fills placeholders, including numbers', () => {
  assert.equal(translate(messages, 'a.b', { name: 'Ali', n: 3 }), 'Hello Ali, you have 3 jobs');
});

test('leaves an unknown placeholder visible', () => {
  assert.equal(translate(messages, 'a.b', { name: 'Ali' }), 'Hello Ali, you have {n} jobs');
});

test('a missing key returns the key, not an empty string', () => {
  assert.equal(translate(messages, 'a.missing'), 'a.missing');
  assert.equal(translate(messages, 'a'), 'a');
  assert.equal(translate(messages, 'plain.deeper'), 'plain.deeper');
});
