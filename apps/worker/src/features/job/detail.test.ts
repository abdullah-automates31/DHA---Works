import assert from 'node:assert/strict';
import { test } from 'node:test';

import { jobChip, postedText, standingFromMyJob } from './detail.ts';

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

test('standing from the worker own job row', () => {
  assert.equal(standingFromMyJob({ status: 'interested', myQuoteStatus: null }), 'interested');
  assert.equal(standingFromMyJob({ status: 'quoted', myQuoteStatus: 'sent' }), 'quoted');
  assert.equal(standingFromMyJob({ status: 'quoted', myQuoteStatus: 'rejected' }), 'closed');
  assert.equal(standingFromMyJob({ status: 'scheduled', myQuoteStatus: 'not_selected' }), 'closed');
  assert.equal(standingFromMyJob({ status: 'expired', myQuoteStatus: null }), 'closed');
  assert.equal(standingFromMyJob({ status: 'cancelled', myQuoteStatus: null }), 'closed');
  assert.equal(standingFromMyJob({ status: 'open', myQuoteStatus: 'withdrawn' }), 'closed');
});
