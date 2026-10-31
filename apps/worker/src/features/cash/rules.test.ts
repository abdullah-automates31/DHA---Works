import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CASH_REASONS, cashErrorKey, checkCash, isMoreThanQuote, recordCash } from './rules.ts';

const agreed = 3200;

test('the full amount is the agreed amount and needs no reason', () => {
  assert.deepEqual(checkCash({ mode: 'full', amount: '9', reason: null }, agreed), { ok: true, amount: 3200, reason: null });
});

test('a different amount needs an amount and a reason', () => {
  assert.deepEqual(checkCash({ mode: 'different', amount: '', reason: null }, agreed), { ok: false, missing: 'amount' });
  assert.deepEqual(checkCash({ mode: 'different', amount: '3000', reason: null }, agreed), { ok: false, missing: 'reason' });
  assert.deepEqual(checkCash({ mode: 'different', amount: '3000', reason: 'made up' }, agreed), { ok: false, missing: 'reason' });
  assert.deepEqual(checkCash({ mode: 'different', amount: '3,000', reason: CASH_REASONS[2] }, agreed), { ok: true, amount: 3000, reason: 'I gave a discount' });
  assert.deepEqual(checkCash({ mode: 'different', amount: '3500', reason: CASH_REASONS[0] }, agreed), { ok: true, amount: 3500, reason: 'Extra work was needed' });
});

test('zero is a valid amount (nothing was paid) but still needs a reason', () => {
  assert.deepEqual(checkCash({ mode: 'different', amount: '0', reason: null }, agreed), { ok: false, missing: 'reason' });
  assert.deepEqual(checkCash({ mode: 'different', amount: '0', reason: CASH_REASONS[3] }, agreed), { ok: true, amount: 0, reason: 'Something else' });
});

test('a "different" amount that equals the quote is just the full amount', () => {
  assert.deepEqual(checkCash({ mode: 'different', amount: '3200', reason: null }, agreed), { ok: true, amount: 3200, reason: null });
});

test('more than the quote is flagged', () => {
  assert.equal(isMoreThanQuote({ mode: 'different', amount: '3201', reason: null }, agreed), true);
  assert.equal(isMoreThanQuote({ mode: 'different', amount: '3200', reason: null }, agreed), false);
  assert.equal(isMoreThanQuote({ mode: 'different', amount: '', reason: null }, agreed), false);
  assert.equal(isMoreThanQuote({ mode: 'full', amount: '9999', reason: null }, agreed), false);
});

test('database refusals map to friendly keys', () => {
  assert.equal(cashErrorKey({ message: 'record the cash after you mark the job completed' }), 'cash.errors.notReady');
  assert.equal(cashErrorKey({ message: 'enter the amount you received' }), 'cash.errors.amount');
  assert.equal(cashErrorKey({ message: 'explain why the amount differs from the quote' }), 'cash.errors.reason');
  assert.equal(cashErrorKey({ message: 'you have already recorded the amount' }), 'cash.errors.alreadyRecorded');
  assert.equal(cashErrorKey({ name: 'TypeError', message: 'x' }), 'cash.errors.network');
  assert.equal(cashErrorKey({ message: 'weird' }), 'cash.errors.generic');
});

test('recording passes the amount and reason through and reports refusals', async () => {
  const seen: unknown[] = [];
  const ok = { recordCash: async (id: string, a: number, r: string | null) => (seen.push([id, a, r]), { error: null }) };
  assert.deepEqual(await recordCash(ok, 'j1', 3000, 'I gave a discount'), { ok: true });
  assert.deepEqual(seen, [['j1', 3000, 'I gave a discount']]);
  const refused = { recordCash: async () => ({ error: { message: 'you have already recorded the amount' } }) };
  assert.deepEqual(await recordCash(refused, 'j1', 3200, null), { ok: false, key: 'cash.errors.alreadyRecorded' });
  const down = {
    recordCash: async () => {
      throw new TypeError('Network request failed');
    },
  };
  assert.deepEqual(await recordCash(down, 'j1', 3200, null), { ok: false, key: 'cash.errors.network' });
});
