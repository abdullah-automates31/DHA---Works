import assert from 'node:assert/strict';
import { test } from 'node:test';

import { categoryIconKey, feedSubtitle, joinList, shortDate, timeAgo, timeRange, whenPill } from './format.ts';

const now = new Date(2026, 9, 24, 15, 0); // Sat 24 Oct 2026, 3 PM

test('time ago uses the design wording', () => {
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  assert.equal(timeAgo(ago(20_000), now), 'Just now');
  assert.equal(timeAgo(ago(12 * 60_000), now), '12 min ago');
  assert.equal(timeAgo(ago(60 * 60_000), now), '1 hr ago');
  assert.equal(timeAgo(ago(3 * 3_600_000), now), '3 hrs ago');
  assert.equal(timeAgo(ago(24 * 3_600_000), now), '1 day ago');
  assert.equal(timeAgo(ago(50 * 3_600_000), now), '2 days ago');
  assert.equal(timeAgo(new Date(now.getTime() + 60_000).toISOString(), now), 'Just now'); // clock skew
  assert.equal(timeAgo(null, now), '');
  assert.equal(timeAgo('nope', now), '');
});

test('lists read naturally', () => {
  assert.equal(joinList([]), '');
  assert.equal(joinList(['Plumbing']), 'Plumbing');
  assert.equal(joinList(['Plumbing', 'Electrical']), 'Plumbing and Electrical');
  assert.equal(joinList(['5', '6', '7']), '5, 6 and 7');
});

test('the subtitle is built from the worker trades and phases', () => {
  assert.equal(feedSubtitle(['Plumbing'], [7, 5, 6]), 'Plumbing jobs in Phase 5, 6 and 7');
  assert.equal(feedSubtitle(['Plumbing', 'AC & Refrigeration'], [6]), 'Plumbing and AC & Refrigeration jobs in Phase 6');
  assert.equal(feedSubtitle([], []), 'Jobs');
});

test('time ranges from postgres time values', () => {
  assert.equal(timeRange('16:00:00', '18:00:00'), '4 to 6 PM');
  assert.equal(timeRange('11:00:00', '13:00:00'), '11 AM to 1 PM');
  assert.equal(timeRange('09:30:00', '11:30:00'), '9:30 to 11:30 AM');
  assert.equal(timeRange('16:00:00', null), '4 PM');
  assert.equal(timeRange(null, null), '');
  assert.equal(timeRange('00:00:00', '02:00:00'), '12 to 2 AM');
});

test('short dates', () => {
  assert.equal(shortDate('2026-10-24'), 'Sat 24 Oct');
  assert.equal(shortDate('2026-10-25'), 'Sun 25 Oct');
  assert.equal(shortDate(null), '');
});

test('the time pill for ASAP and scheduled jobs', () => {
  const base = { preferredDate: null, windowFrom: null, windowTo: null };
  assert.deepEqual(whenPill({ ...base, urgency: 'asap', postedAt: new Date(2026, 9, 24, 14, 40).toISOString() }, now), {
    urgent: true,
    text: 'As soon as possible · today',
  });
  assert.deepEqual(whenPill({ ...base, urgency: 'asap', postedAt: new Date(2026, 9, 23, 20, 0).toISOString() }, now), {
    urgent: true,
    text: 'As soon as possible',
  });
  assert.deepEqual(
    whenPill({ urgency: 'scheduled', preferredDate: '2026-10-24', windowFrom: '16:00:00', windowTo: '18:00:00', postedAt: null }, now),
    { urgent: false, text: 'Sat 24 Oct · 4 to 6 PM' },
  );
  assert.deepEqual(whenPill({ urgency: 'scheduled', preferredDate: '2026-10-25', windowFrom: null, windowTo: null, postedAt: null }, now), {
    urgent: false,
    text: 'Sun 25 Oct',
  });
});

test('category icons come from the catalogue ids, with a fallback', () => {
  assert.equal(categoryIconKey(1), 'wrench');
  assert.equal(categoryIconKey(3), 'snow');
  assert.equal(categoryIconKey(99), 'tool');
  assert.equal(categoryIconKey(null), 'tool');
});
