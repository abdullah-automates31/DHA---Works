import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAX_VOICE_BYTES,
  buildVoicePath,
  checkVoice,
  digitsOnly,
  formatDuration,
  parseFee,
  parseYears,
  toggleTrade,
  voiceProgress,
} from './rules.ts';

test('years: blank is allowed, 0 to 70 is valid, anything else is not', () => {
  assert.deepEqual(parseYears(''), { ok: true, value: null });
  assert.deepEqual(parseYears('  '), { ok: true, value: null });
  assert.deepEqual(parseYears('0'), { ok: true, value: 0 });
  assert.deepEqual(parseYears('6'), { ok: true, value: 6 });
  assert.deepEqual(parseYears('70'), { ok: true, value: 70 });
  for (const bad of ['71', '100', '-1', '6.5', 'six', '1e1']) assert.deepEqual(parseYears(bad), { ok: false }, bad);
});

test('fee: blank is allowed, whole rupees up to 7 digits', () => {
  assert.deepEqual(parseFee(''), { ok: true, value: null });
  assert.deepEqual(parseFee('0'), { ok: true, value: 0 });
  assert.deepEqual(parseFee('800'), { ok: true, value: 800 });
  assert.deepEqual(parseFee('9999999'), { ok: true, value: 9999999 });
  for (const bad of ['10000000', '-5', '800.50', 'Rs 800', '1,000']) assert.deepEqual(parseFee(bad), { ok: false }, bad);
});

test('digitsOnly strips everything else and caps the length', () => {
  assert.equal(digitsOnly('Rs 8,00', 7), '800');
  assert.equal(digitsOnly('123456789', 2), '12');
});

test('trades toggle on and off without mutating the list', () => {
  const start = [1, 3];
  assert.deepEqual(toggleTrade(start, 2), [1, 3, 2]);
  assert.deepEqual(toggleTrade(start, 3), [1]);
  assert.deepEqual(start, [1, 3]);
});

test('durations read like the design', () => {
  assert.equal(formatDuration(18_000), '0:18');
  assert.equal(formatDuration(5_400), '0:05');
  assert.equal(formatDuration(30_000), '0:30');
  assert.equal(formatDuration(61_000), '1:01');
  assert.equal(formatDuration(-5), '0:00');
});

test('voice checks: empty, too short, too large', () => {
  assert.deepEqual(checkVoice(0, 5000), { ok: false, reason: 'empty' });
  assert.deepEqual(checkVoice(1000, 400), { ok: false, reason: 'tooShort' });
  assert.deepEqual(checkVoice(MAX_VOICE_BYTES + 1, 5000), { ok: false, reason: 'tooLarge' });
  assert.deepEqual(checkVoice(120_000, 18_000), { ok: true });
  assert.deepEqual(checkVoice(120_000, 1000), { ok: true });
});

test('voice path starts with the user id and is new every time', () => {
  const a = buildVoicePath('u1', 1, 'aa');
  assert.equal(a, 'u1/voice_intro-1-aa.m4a');
  assert.notEqual(a, buildVoicePath('u1', 2, 'bb'));
});

test('progress is clamped to the 30 s window', () => {
  assert.equal(voiceProgress(15_000), 0.5);
  assert.equal(voiceProgress(45_000), 1);
  assert.equal(voiceProgress(-1), 0);
});
