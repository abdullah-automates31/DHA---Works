import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSubmitArgs } from './rules.ts';
import { quoteErrorKey, sendQuote } from './submit.ts';

const args = buildSubmitArgs('job-1', { labour: '1500', materials: '', materialsNote: '', other: '', otherNote: '' }, new Date(2026, 9, 24, 9), 0, 1);

test('every database refusal maps to a friendly key', () => {
  const cases: [string, string][] = [
    ['you already sent a quote; withdraw it first', 'quote.errors.alreadySent'],
    ['the resident did not accept your quote on this job', 'quote.errors.rejected'],
    ['this job has expired', 'quote.errors.expired'],
    ['show interest in the job before sending a quote', 'quote.errors.needInterest'],
    ['choose a visit time in the future', 'quote.errors.past'],
    ['this job is not available for quotes', 'quote.errors.notAvailable'],
    ['your account is not approved yet', 'quote.errors.notAvailable'],
    ['new row violates check constraint "quotes_total_positive"', 'quote.errors.total'],
    ['new row violates check constraint "quotes_other_note_required"', 'quote.errors.otherNote'],
    ['Network request failed', 'quote.errors.network'],
    ['something internal', 'quote.errors.generic'],
  ];
  for (const [message, key] of cases) assert.equal(quoteErrorKey({ message }), key, message);
  assert.equal(quoteErrorKey(null), 'quote.errors.generic');
  assert.equal(quoteErrorKey({ name: 'TypeError', message: 'x' }), 'quote.errors.network');
});

test('a sent quote is reported as ok and the request is passed through unchanged', async () => {
  const seen: unknown[] = [];
  const client = {
    async submitQuote(a: typeof args) {
      seen.push(a);
      return { error: null };
    },
  };
  assert.deepEqual(await sendQuote(client, args), { ok: true });
  assert.deepEqual(seen, [args]);
});

test('a refusal is returned, not thrown', async () => {
  const client = { submitQuote: async () => ({ error: { message: 'this job has expired' } }) };
  assert.deepEqual(await sendQuote(client, args), { ok: false, key: 'quote.errors.expired' });
});

test('a lost connection is a network message without its text', async () => {
  const client = {
    submitQuote: async () => {
      throw new TypeError('Network request failed');
    },
  };
  assert.deepEqual(await sendQuote(client, args), { ok: false, key: 'quote.errors.network' });
});

test('a second tap after a sent quote reports "already sent"', async () => {
  let calls = 0;
  const client = {
    async submitQuote() {
      calls += 1;
      return calls === 1 ? { error: null } : { error: { message: 'you already sent a quote; withdraw it first' } };
    },
  };
  assert.deepEqual(await sendQuote(client, args), { ok: true });
  assert.deepEqual(await sendQuote(client, args), { ok: false, key: 'quote.errors.alreadySent' });
});
