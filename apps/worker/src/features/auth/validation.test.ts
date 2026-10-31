import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  formatPhoneDisplay,
  isCompleteOtp,
  isValidPhone,
  maskPhone,
  normalizePhone,
  sanitizeOtp,
} from './validation.ts';

test('normalizePhone accepts common Pakistani mobile formats', () => {
  assert.equal(normalizePhone('3214567890'), '+923214567890');
  assert.equal(normalizePhone('03214567890'), '+923214567890');
  assert.equal(normalizePhone('923214567890'), '+923214567890');
  assert.equal(normalizePhone('00923214567890'), '+923214567890');
  assert.equal(normalizePhone('+92 321 4567890'), '+923214567890');
});

test('normalizePhone rejects wrong lengths and prefixes', () => {
  for (const bad of ['', '321456789', '32145678901', '2214567890', '0214567890', 'abc']) {
    assert.equal(normalizePhone(bad), null, bad);
  }
});

test('isValidPhone uses the same rule', () => {
  assert.ok(isValidPhone('321 4567890'));
  assert.equal(isValidPhone('12345'), false);
});

test('display and masking hide the middle of a number', () => {
  assert.equal(formatPhoneDisplay('+923214567890'), '+92 321 4567890');
  assert.equal(maskPhone('+923214567890'), '+92 321 ***7890');
  assert.equal(maskPhone('923214567890'), '+92 321 ***7890');
  assert.equal(maskPhone('not-a-phone'), 'not-a-phone');
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
