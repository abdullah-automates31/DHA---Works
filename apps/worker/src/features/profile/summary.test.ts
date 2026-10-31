import assert from 'node:assert/strict';
import { test } from 'node:test';

import { areaSummary, parseEarnings, ratingText, tradeSummary } from './summary.ts';

test('areas read as a sentence, in order', () => {
  assert.equal(areaSummary([7, 5, 6]), 'Phase 5, 6 and 7');
  assert.equal(areaSummary([6]), 'Phase 6');
  assert.equal(areaSummary([]), 'No areas yet');
});

test('trades read as a sentence', () => {
  assert.equal(tradeSummary(['Plumber']), 'Plumber');
  assert.equal(tradeSummary(['Plumber', 'Electrician']), 'Plumber and Electrician');
  assert.equal(tradeSummary([]), 'No trade yet');
});

test('a worker with no ratings shows a dash, not 0.0', () => {
  assert.equal(ratingText(4.8, 312), '4.8');
  assert.equal(ratingText(4.75, 4), '4.8');
  assert.equal(ratingText(0, 0), '–');
  assert.equal(ratingText(null, 0), '–');
});

test('earnings are read defensively', () => {
  assert.deepEqual(parseEarnings({ cash_total: 38500, jobs_count: 12, rating_avg: '4.80', rating_count: 312, jobs_done: 312 }), {
    cashThisWeek: 38500, weekJobs: 12, ratingAvg: 4.8, ratingCount: 312, jobsDone: 312,
  });
  assert.deepEqual(parseEarnings(null), { cashThisWeek: 0, weekJobs: 0, ratingAvg: null, ratingCount: 0, jobsDone: 0 });
  assert.deepEqual(parseEarnings({ cash_total: 'x' }).cashThisWeek, 0);
});
