import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isCompleteOtp, isValidEmail, normalizeEmail, sanitizeOtp } from './validation.ts';

test('normalizeEmail trims and lower-cases', () => {
  assert.equal(normalizeEmail('  Usman.Khan@Gmail.com '), 'usman.khan@gmail.com');
});

test('accepts ordinary addresses', () => {
  assert.ok(isValidEmail('usman.khan@gmail.com'));
  assert.ok(isValidEmail(' a+tag@sub.example.pk '));
});

test('rejects malformed addresses', () => {
  for (const bad of ['', 'plain', 'a@b', 'a@b.', '@x.com', 'a b@x.com', 'a@@x.com', 'a@x.c']) {
    assert.equal(isValidEmail(bad), false, bad);
  }
});

test('rejects an address longer than 254 characters', () => {
  assert.equal(isValidEmail('a'.repeat(250) + '@x.com'), false);
});

test('sanitizeOtp keeps digits only and caps at 6', () => {
  assert.equal(sanitizeOtp('123 456'), '123456');
  assert.equal(sanitizeOtp('12-34ab56789'), '123456');
  assert.equal(sanitizeOtp(''), '');
});

test('isCompleteOtp needs exactly 6 digits', () => {
  assert.equal(isCompleteOtp('12345'), false);
  assert.equal(isCompleteOtp('123456'), true);
});
