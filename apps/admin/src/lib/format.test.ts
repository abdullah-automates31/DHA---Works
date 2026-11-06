import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ago, buildHref, dateOnly, dateTime, firstName, jobStatus, lastPage, pageNumber, parseJobFilter, phoneText, progressDone, reportKind, rupees, searchText, sentence, telHref, timeOnly, underReviewText } from './format.ts';
import { isUuid, num, page, safePath } from './json.ts';

const now = new Date('2026-11-07T12:00:00Z');
const minus = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

test('money', () => {
  assert.equal(rupees(3200), 'Rs 3,200');
  assert.equal(rupees(0), 'Rs 0');
  assert.equal(rupees(null), 'No quote');
  assert.equal(rupees(1234567), 'Rs 1,234,567');
});

test('how long ago', () => {
  assert.equal(ago(minus(0), now), 'just now');
  assert.equal(ago(minus(12), now), '12 min ago');
  assert.equal(ago(minus(180), now), '3 h ago');
  assert.equal(ago(minus(60 * 24), now), '1 day ago');
  assert.equal(ago(minus(60 * 24 * 3), now), '3 days ago');
  assert.equal(ago(null, now), '-');
  assert.equal(ago('nonsense', now), 'just now');
});

test('dates and times are Karachi time', () => {
  assert.equal(dateTime('2026-10-24T04:40:00Z'), '24 Oct, 9:40 AM');
  assert.equal(dateOnly('2026-09-12T20:30:00Z'), '13 Sep 2026'); // already the next day in Karachi (UTC+5)
  assert.equal(timeOnly('2026-10-24T06:08:00Z'), '11:08 AM');
  assert.equal(dateTime(null), '-');
  assert.equal(dateTime('bad'), '-');
});

test('text helpers', () => {
  assert.equal(sentence('cash_price'), 'Cash price');
  assert.equal(sentence(null), '');
  assert.equal(firstName('Usman Khan'), 'Usman');
  assert.equal(firstName(null), 'them');
  assert.equal(firstName('   '), 'them');
});

test('phone numbers: shown in groups, dialled as digits, never a bad link', () => {
  assert.equal(phoneText('03214567890'), '0321 456 7890');
  assert.equal(phoneText('+923214567890'), '+923214567890');
  assert.equal(phoneText(null), 'No phone');
  assert.equal(telHref('0321 456 7890'), 'tel:03214567890');
  assert.equal(telHref('+92 321 456 7890'), 'tel:+923214567890');
  assert.equal(telHref('javascript:alert(1)'), null);
  assert.equal(telHref('12'), null);
  assert.equal(telHref(null), null);
});

test('job status and progress', () => {
  assert.deepEqual(jobStatus('in_progress'), { label: 'In progress', tone: 'pur' });
  assert.equal(jobStatus('cash_collected').label, 'Cash collected');
  assert.equal(jobStatus('weird_new_status').label, 'Weird new status');
  assert.equal(progressDone('open'), 0);
  assert.equal(progressDone('scheduled'), 3);
  assert.equal(progressDone('in_progress'), 4);
  assert.equal(progressDone('completed'), 5);
  assert.equal(progressDone('cash_collected'), 6);
  assert.equal(progressDone('reviewed'), 7);
  assert.equal(parseJobFilter('quoted'), 'quoted');
  assert.equal(parseJobFilter('draft'), null);
  assert.equal(parseJobFilter(['open']), null);
});

test('why a job is under review, and report kinds', () => {
  assert.equal(underReviewText('worker_suspended'), 'The worker is suspended');
  assert.equal(underReviewText(null), null);
  assert.equal(underReviewText('something_else'), 'Something else');
  assert.deepEqual(reportKind('unsafe'), { label: 'Unsafe', tone: 'red' });
  assert.equal(reportKind('rude_damage').label, 'Rude or damage');
  assert.equal(reportKind('brand_new').label, 'Brand new');
});

test('address bar values are cleaned', () => {
  assert.equal(pageNumber('3'), 3);
  assert.equal(pageNumber('0'), 1);
  assert.equal(pageNumber('-4'), 1);
  assert.equal(pageNumber('2e3'), 1);
  assert.equal(pageNumber(undefined), 1);
  assert.equal(pageNumber('99999999'), 1);
  assert.equal(lastPage(0), 1);
  assert.equal(lastPage(26), 2);
  assert.equal(searchText('  rida  '), 'rida');
  assert.equal(searchText('x'.repeat(200)).length, 80);
  assert.equal(searchText(['a']), '');
  assert.equal(buildHref('/jobs', { status: 'open', q: '', page: null, today: false, phase: 6 }), '/jobs?status=open&phase=6');
  assert.equal(buildHref('/jobs', {}), '/jobs');
  assert.equal(buildHref('/users', { q: 'a&b=c' }), '/users?q=a%26b%3Dc');
});

test('checked readers never trust the reply', () => {
  assert.equal(num('4.50'), 4.5);
  assert.equal(num('x'), null);
  assert.equal(num(NaN), null);
  assert.equal(isUuid('00000000-0000-4000-8000-0000000000b1'), true);
  assert.equal(isUuid('../../etc'), false);
  assert.equal(safePath('00000000-0000-4000-8000-0000000000b1/a.jpg'), true);
  assert.equal(safePath('00000000-0000-4000-8000-0000000000b1/../x.jpg'), false);
  assert.equal(safePath('/etc/passwd'), false);
  assert.equal(safePath(null), false);
  const p = page({ total: 5, rows: [{ a: 1 }, null, 'x', { a: 2 }] }, (r) => (typeof r.a === 'number' ? r.a : null));
  assert.deepEqual(p, { total: 5, rows: [1, 2] });
  assert.deepEqual(page('garbage', () => 1), { total: 0, rows: [] });
});
