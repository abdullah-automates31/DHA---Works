import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDashboard } from './parse.ts';
import { agoText, attentionHref, barPercent, dateLine, maxStage, oldestText } from './rules.ts';

const ID = '00000000-0000-4000-8000-0000000000b1';
const now = new Date('2026-11-07T12:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

test('a full reply is parsed', () => {
  const d = parseDashboard({
    workers_pending: { count: 2, oldest_since: ago(1200) },
    residents_pending: { count: 1, oldest_since: ago(540) },
    reports_open: { count: 4, unsafe: 1 },
    jobs_today: { count: 23, in_progress: 4 },
    stages: { open: 5, scheduled: 6, in_progress: 4, completed: 2, cash_collected: 3, disputed: 1 },
    attention: [
      { id: ID, kind: 'unsafe', title: 'RP-0001 · unsafe', detail: 'DW-1 · Leak · Phase 6', since: ago(12) },
      { id: ID, kind: 'worker', title: 'Ali is waiting for review', detail: 'Worker application', since: ago(1200) },
    ],
  });
  assert.equal(d.workers.count, 2);
  assert.equal(d.reports.unsafe, 1);
  assert.equal(d.jobsToday.inProgress, 4);
  assert.equal(d.stages.cash_collected, 3);
  assert.equal(d.attention.length, 2);
});

test('garbage becomes zeros and an empty list, never an error', () => {
  for (const bad of [null, undefined, 'x', 5, [], { stages: 'no', attention: 'no' }, { workers_pending: { count: -3 }, reports_open: { count: 'many' } }]) {
    const d = parseDashboard(bad);
    assert.equal(d.workers.count, 0);
    assert.equal(d.reports.count, 0);
    assert.deepEqual(d.attention, []);
    assert.equal(d.stages.open, 0);
  }
});

test('attention items with a wrong kind, a missing field or a bad date are dropped, and the list is capped at 10', () => {
  const good = { id: ID, kind: 'stuck', title: 't', detail: 'd', since: ago(5) };
  const d = parseDashboard({
    attention: [
      { ...good, kind: 'hack' }, { ...good, id: '' }, { ...good, title: null }, { ...good, since: 'not a date' }, null, 'x',
      ...Array.from({ length: 14 }, () => good),
    ],
  });
  assert.equal(d.attention.length, 10);
});

test('bars: relative to the biggest stage, a small count still shows, zero shows nothing', () => {
  assert.equal(barPercent(8, 8), 100);
  assert.equal(barPercent(4, 8), 50);
  assert.equal(barPercent(1, 100), 4);
  assert.equal(barPercent(0, 8), 0);
  assert.equal(barPercent(5, 0), 0);
  assert.equal(barPercent(500, 8), 100);
  assert.equal(maxStage({ open: 5, scheduled: 6, in_progress: 4, completed: 2, cash_collected: 3, disputed: 1 }), 6);
  assert.equal(maxStage({ open: 0, scheduled: 0, in_progress: 0, completed: 0, cash_collected: 0, disputed: 0 }), 0);
});

test('items open the right screen and an odd id never builds a link into an application', () => {
  const base = { title: 't', detail: '', since: ago(1) };
  assert.equal(attentionHref({ ...base, id: ID, kind: 'worker' }), `/workers/${ID}`);
  assert.equal(attentionHref({ ...base, id: ID, kind: 'resident' }), `/residents/${ID}`);
  assert.equal(attentionHref({ ...base, id: '../../x', kind: 'worker' }), '/jobs');
  assert.equal(attentionHref({ ...base, id: ID, kind: 'unsafe' }), `/reports/${ID}`);
  assert.equal(attentionHref({ ...base, id: ID, kind: 'report' }), `/reports/${ID}`);
  assert.equal(attentionHref({ ...base, id: '../x', kind: 'report' }), '/reports');
  assert.equal(attentionHref({ ...base, id: ID, kind: 'cancellation' }), '/jobs/cancellations');
  assert.equal(attentionHref({ ...base, id: ID, kind: 'stuck' }), `/jobs/${ID}`);
  assert.equal(attentionHref({ ...base, id: '../x', kind: 'stuck' }), '/jobs');
});

test('time wording', () => {
  assert.equal(agoText(ago(0), now), 'just now');
  assert.equal(agoText(ago(12), now), '12 min ago');
  assert.equal(agoText(ago(180), now), '3 h ago');
  assert.equal(agoText(ago(60 * 72), now), '3 d ago');
  assert.equal(agoText(null, now), '-');
  assert.equal(agoText(ago(-30), now), 'just now');
  assert.equal(oldestText(0, ago(100), now), null);
  assert.equal(oldestText(2, null, now), null);
  assert.equal(oldestText(2, ago(30), now), 'Oldest waiting under 1 h');
  assert.equal(oldestText(2, ago(1200), now), 'Oldest waiting 20 h');
  assert.equal(oldestText(2, ago(60 * 72), now), 'Oldest waiting 3 d');
});

test('the date line is in Karachi time, even just before midnight UTC', () => {
  assert.equal(dateLine(new Date('2026-10-24T10:00:00Z')), 'Saturday, 24 October');
  assert.equal(dateLine(new Date('2026-10-24T20:30:00Z')), 'Sunday, 25 October'); // already the next day in Karachi (UTC+5)
});
