import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSubmitArgs } from './rules.ts';
import { quoteErrorKey, sendQuote } from './submit.ts';

const args = buildSubmitArgs('job-1', { labour: '1500', withMaterials: false, items: [], hasBill: false });

test('every database refusal maps to a friendly key', () => {
  const cases: [string, string][] = [
    ['you already sent a quote; withdraw it first', 'quote.errors.alreadySent'],
    ['the resident did not accept your quote on this job', 'quote.errors.rejected'],
    ['this job has expired', 'quote.errors.expired'],
    ['show interest in the job before sending a quote', 'quote.errors.needInterest'],
    ['this job is not available for quotes', 'quote.errors.notAvailable'],
    ['your account is not approved yet', 'quote.errors.notAvailable'],
    ['new row violates check constraint "quotes_total_positive"', 'quote.errors.total'],
    ['new row violates check constraint "quotes_other_note_required"', 'quote.errors.otherNote'],
    ['upload the material bill', 'quote.errors.billRequired'],
    ['invalid bill path', 'quote.errors.billInvalid'],
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

const withMaterials = buildSubmitArgs('job-1', { labour: '1500', withMaterials: true, items: [{ name: 'Pipe', price: '500' }], hasBill: true });
const photo = { bytes: new ArrayBuffer(2000), mime: 'image/jpeg' };

test('with materials the bill is uploaded first and its path goes with the quote', async () => {
  const calls: string[] = [];
  const client = {
    async uploadBill(_b: ArrayBuffer, _m: string, ext: string) {
      calls.push('upload ' + ext);
      return { path: 'worker/bill-1.jpg', error: null };
    },
    async submitQuote(a: typeof withMaterials) {
      calls.push('submit ' + a.p_material_bill_path);
      return { error: null };
    },
  };
  assert.deepEqual(await sendQuote(client, withMaterials, photo), { ok: true });
  assert.deepEqual(calls, ['upload jpg', 'submit worker/bill-1.jpg']);
});

test('a quote with materials but no photo is not sent', async () => {
  let sent = false;
  const client = { uploadBill: async () => ({ path: 'x', error: null }), submitQuote: async () => ((sent = true), { error: null }) };
  assert.deepEqual(await sendQuote(client, withMaterials, null), { ok: false, key: 'quote.errors.billRequired' });
  assert.equal(sent, false);
});

test('a bad or oversized photo is refused before anything is uploaded', async () => {
  let uploaded = false;
  const client = { uploadBill: async () => ((uploaded = true), { path: 'x', error: null }), submitQuote: async () => ({ error: null }) };
  assert.deepEqual(await sendQuote(client, withMaterials, { bytes: new ArrayBuffer(10), mime: 'application/pdf' }), { ok: false, key: 'quote.errors.billType' });
  assert.deepEqual(await sendQuote(client, withMaterials, { bytes: new ArrayBuffer(6 * 1024 * 1024), mime: 'image/jpeg' }), { ok: false, key: 'quote.errors.billSize' });
  assert.equal(uploaded, false);
});

test('a failed upload stops the quote', async () => {
  let submitted = false;
  const client = { uploadBill: async () => ({ path: null, error: { message: 'boom' } }), submitQuote: async () => ((submitted = true), { error: null }) };
  assert.deepEqual(await sendQuote(client, withMaterials, photo), { ok: false, key: 'quote.errors.billUpload' });
  assert.equal(submitted, false);
});

test('when the quote is refused the uploaded bill is removed again', async () => {
  const removed: string[] = [];
  const client = {
    uploadBill: async () => ({ path: 'worker/bill-2.jpg', error: null }),
    deleteBill: async (p: string) => void removed.push(p),
    submitQuote: async () => ({ error: { message: 'this job has expired' } }),
  };
  assert.deepEqual(await sendQuote(client, withMaterials, photo), { ok: false, key: 'quote.errors.expired' });
  assert.deepEqual(removed, ['worker/bill-2.jpg']);
});

test('without materials no photo is needed or uploaded', async () => {
  let uploaded = false;
  const client = { uploadBill: async () => ((uploaded = true), { path: 'x', error: null }), submitQuote: async () => ({ error: null }) };
  assert.deepEqual(await sendQuote(client, args, null), { ok: true });
  assert.equal(uploaded, false);
});
