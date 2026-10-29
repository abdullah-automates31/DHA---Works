import assert from 'node:assert/strict';
import { test } from 'node:test';

import { interestBanner, interestErrorKey, jobChip, postedText, standingFromMyJob, startQuote } from './detail.ts';

const now = new Date(2026, 9, 29, 15, 0);
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

test('chip: urgent for ASAP, new for the first two hours, otherwise open', () => {
  assert.equal(jobChip('asap', ago(5 * 3_600_000), now), 'urgent');
  assert.equal(jobChip('scheduled', ago(10 * 60_000), now), 'new');
  assert.equal(jobChip('scheduled', ago(119 * 60_000), now), 'new');
  assert.equal(jobChip('scheduled', ago(121 * 60_000), now), 'open');
  assert.equal(jobChip('scheduled', null, now), 'open');
});

test('posted text keeps the design wording', () => {
  assert.equal(postedText('12 min ago'), 'Posted 12 min ago');
  assert.equal(postedText('1 hr ago'), 'Posted 1 hr ago');
  assert.equal(postedText('Just now'), 'Posted just now');
  assert.equal(postedText(''), '');
});

test('the interested banner counts others and hides when there are none', () => {
  assert.equal(interestBanner(0, 0), null);
  assert.equal(interestBanner(null, null), null);
  assert.deepEqual(interestBanner(1, 0), { titleKey: 'job.interested.one', count: 1, quoted: 0 });
  assert.deepEqual(interestBanner(2, 1), { titleKey: 'job.interested.many', count: 2, quoted: 1 });
  assert.deepEqual(interestBanner(3, undefined), { titleKey: 'job.interested.many', count: 3, quoted: 0 });
});

test('standing from the worker own job row', () => {
  assert.equal(standingFromMyJob({ status: 'interested', myQuoteStatus: null }), 'interested');
  assert.equal(standingFromMyJob({ status: 'quoted', myQuoteStatus: 'sent' }), 'quoted');
  assert.equal(standingFromMyJob({ status: 'quoted', myQuoteStatus: 'rejected' }), 'closed');
  assert.equal(standingFromMyJob({ status: 'scheduled', myQuoteStatus: 'not_selected' }), 'closed');
  assert.equal(standingFromMyJob({ status: 'expired', myQuoteStatus: null }), 'closed');
  assert.equal(standingFromMyJob({ status: 'cancelled', myQuoteStatus: null }), 'closed');
  assert.equal(standingFromMyJob({ status: 'open', myQuoteStatus: 'withdrawn' }), 'closed');
});

test('express_interest failures map to friendly keys without raw text', () => {
  assert.equal(interestErrorKey({ message: 'this job is not available' }), 'job.errors.unavailable');
  assert.equal(interestErrorKey({ message: 'your account is not approved yet' }), 'job.errors.unavailable');
  assert.equal(interestErrorKey({ message: 'the resident did not accept your quote on this job' }), 'job.errors.rejected');
  assert.equal(interestErrorKey({ name: 'TypeError', message: 'Network request failed' }), 'job.errors.network');
  assert.equal(interestErrorKey({ message: 'weird internals' }), 'job.errors.generic');
  assert.equal(interestErrorKey(null), 'job.errors.generic');
});

test('I will quote this job records interest once per call and is safe to repeat', async () => {
  const calls: string[] = [];
  const client = {
    async expressInterest(id: string) {
      calls.push(id);
      return { error: null };
    },
  };
  assert.deepEqual(await startQuote(client, 'job-1'), { ok: true });
  assert.deepEqual(await startQuote(client, 'job-1'), { ok: true });
  assert.deepEqual(calls, ['job-1', 'job-1']);
});

test('a refused or failing request is reported, never thrown', async () => {
  const refused = { expressInterest: async () => ({ error: { message: 'this job is not available' } }) };
  assert.deepEqual(await startQuote(refused, 'x'), { ok: false, key: 'job.errors.unavailable' });
  const down = {
    expressInterest: async () => {
      throw new TypeError('Network request failed');
    },
  };
  assert.deepEqual(await startQuote(down, 'x'), { ok: false, key: 'job.errors.network' });
});
