import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  firstName,
  formatHomeDate,
  formatRupees,
  formatTodayHeading,
  initialsOf,
  isSameDay,
  newJobsText,
  shortName,
  timeWindow,
} from './format.ts';

const sat = new Date(2026, 9, 24, 9, 0); // Saturday 24 Oct 2026

test('greeting name is the first word', () => {
  assert.equal(firstName('Usman Khan'), 'Usman');
  assert.equal(firstName('  Hira  '), 'Hira');
  assert.equal(firstName(null), '');
});

test('dates read like the design', () => {
  assert.equal(formatHomeDate(sat), 'Saturday, 24 Oct');
  assert.equal(formatTodayHeading(sat), 'Today, Sat 24 Oct');
});

test('time windows', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 24, h, m).toISOString();
  assert.equal(timeWindow(at(11), at(13)), '11 AM to 1 PM');
  assert.equal(timeWindow(at(16), null), '4 PM');
  assert.equal(timeWindow(at(9, 30), at(11, 30)), '9:30 AM to 11:30 AM');
  assert.equal(timeWindow(at(0), at(2)), '12 AM to 2 AM');
  assert.equal(timeWindow(at(12), at(14)), '12 PM to 2 PM');
  assert.equal(timeWindow(null, null), '');
  assert.equal(timeWindow('nope', null), '');
});

test('same-day check uses local dates', () => {
  assert.equal(isSameDay(new Date(2026, 9, 24, 23, 59).toISOString(), sat), true);
  assert.equal(isSameDay(new Date(2026, 9, 25, 0, 1).toISOString(), sat), false);
  assert.equal(isSameDay(null, sat), false);
});

test('names are shortened like the design only after acceptance', () => {
  assert.equal(shortName('Hira Farooq'), 'Hira F.');
  assert.equal(shortName('Muhammad Ali Khan'), 'Muhammad K.');
  assert.equal(shortName('Madonna'), 'Madonna');
  assert.equal(shortName(null), '');
  assert.equal(initialsOf('Hira Farooq'), 'HF');
  assert.equal(initialsOf(''), '');
});

test('rupees get thousands separators', () => {
  assert.equal(formatRupees(3200), 'Rs 3,200');
  assert.equal(formatRupees(800), 'Rs 800');
  assert.equal(formatRupees(1234567), 'Rs 1,234,567');
  assert.equal(formatRupees(null), '');
});

test('new-jobs banner text', () => {
  assert.equal(newJobsText(3), '3 new jobs near you');
  assert.equal(newJobsText(1), '1 new job near you');
  assert.equal(newJobsText(0), '0 new jobs near you');
});
