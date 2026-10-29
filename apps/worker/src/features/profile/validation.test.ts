import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cnicDigits,
  dobDigits,
  formatCnic,
  formatDob,
  formatNational,
  isoToDobField,
  isValidCnic,
  isValidName,
  nextFormatted,
  normalizeName,
  normalizePkMobile,
  parseDob,
  sanitizeNationalInput,
  storedPhoneToField,
} from './validation.ts';

test('names are trimmed and collapsed; they need a letter', () => {
  assert.equal(normalizeName('  Usman   Khan '), 'Usman Khan');
  assert.ok(isValidName('Usman Khan'));
  assert.ok(isValidName('عثمان خان'));
  assert.equal(isValidName('   '), false);
  assert.equal(isValidName('1234'), false);
  assert.equal(isValidName('a'.repeat(101)), false);
});

test('every common way of writing a Pakistani mobile gives +92 and 10 digits', () => {
  for (const ok of ['321 4567890', '3214567890', '0321 4567890', '03214567890', '+92 321 4567890', '+923214567890', '923214567890', '0092 321 4567890']) {
    assert.equal(normalizePkMobile(ok), '+923214567890', ok);
  }
});

test('invalid mobiles are rejected', () => {
  for (const bad of ['', '321', '123 4567890', '221 4567890', '321 45678901', '021 4567890', 'abc']) {
    assert.equal(normalizePkMobile(bad), null, bad);
  }
});

test('the field keeps at most 10 digits and groups them like the design', () => {
  assert.equal(sanitizeNationalInput('+92 321 45678901234'), '3214567890');
  assert.equal(formatNational('3214567890'), '321 4567890');
  assert.equal(formatNational('32'), '32');
  assert.equal(storedPhoneToField('+923214567890'), '321 4567890');
  assert.equal(storedPhoneToField(null), '');
});

test('CNIC is formatted as #####-#######-# while typing and validated', () => {
  assert.equal(formatCnic('4210156789013'), '42101-5678901-3');
  assert.equal(formatCnic('421015'), '42101-5');
  assert.equal(formatCnic('42101'), '42101');
  assert.equal(formatCnic('42101-5678901-3999'), '42101-5678901-3');
  assert.equal(cnicDigits('42101-5678901-3'), '4210156789013');
  assert.ok(isValidCnic('42101-5678901-3'));
  assert.equal(isValidCnic('42101-567890-13'), false);
  assert.equal(isValidCnic('4210156789013'), false);
  assert.equal(isValidCnic(''), false);
});

test('date of birth is formatted while typing', () => {
  assert.equal(formatDob('14'), '14');
  assert.equal(formatDob('140'), '14 / 0');
  assert.equal(formatDob('14031994'), '14 / 03 / 1994');
  assert.equal(formatDob('14 / 03 / 1994 99'), '14 / 03 / 1994');
  assert.equal(dobDigits('14 / 03 / 1994'), '14031994');
});

test('only real, past dates from 1900 are accepted', () => {
  const today = new Date(2026, 9, 29);
  assert.equal(parseDob('14 / 03 / 1994', today), '1994-03-14');
  assert.equal(parseDob('29 / 02 / 2000', today), '2000-02-29');
  assert.equal(parseDob('29 / 02 / 2001', today), null);
  assert.equal(parseDob('31 / 04 / 1990', today), null);
  assert.equal(parseDob('00 / 01 / 1990', today), null);
  assert.equal(parseDob('10 / 13 / 1990', today), null);
  assert.equal(parseDob('01 / 01 / 1899', today), null);
  assert.equal(parseDob('30 / 10 / 2026', today), null);
  assert.equal(parseDob('29 / 10 / 2026', today), '2026-10-29');
  assert.equal(parseDob('14 / 03', today), null);
});

test('no minimum age is enforced', () => {
  assert.equal(parseDob('01 / 01 / 2020', new Date(2026, 9, 29)), '2020-01-01');
});

test('stored dates fill the field', () => {
  assert.equal(isoToDobField('1994-03-14'), '14 / 03 / 1994');
  assert.equal(isoToDobField(null), '');
});

test('deleting a separator removes the last digit instead of getting stuck', () => {
  const cnicNext = (prev: string, typed: string) => nextFormatted(prev, typed, cnicDigits, formatCnic);
  assert.equal(cnicNext('42101-5', '421015'), '42101'); // the dash was deleted
  assert.equal(cnicNext('42101-5', '42101'), '42101'); // the digit was deleted: a normal edit
  assert.equal(cnicNext('42101-5', '42101-56'), '42101-56');
  assert.equal(cnicNext('42101-5678901-3', '42101-56789013'), '42101-5678901');

  const dobNext = (prev: string, typed: string) => nextFormatted(prev, typed, dobDigits, formatDob);
  assert.equal(dobNext('14 / 03', '14 /03'), '14 / 0'); // part of the separator was deleted
  assert.equal(dobNext('14 / 03', '14 / 0'), '14 / 0'); // the digit was deleted
  assert.equal(dobNext('14 / 0', '14 / 05'), '14 / 05');
});
