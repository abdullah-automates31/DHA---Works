import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatSent } from './sent.ts';

const now = new Date(2026, 9, 29, 15, 30); // 29 Oct 2026, 3:30 PM local

test('today, yesterday and older dates', () => {
  assert.equal(formatSent(new Date(2026, 9, 29, 10, 12).toISOString(), now), 'Today, 10:12 AM');
  assert.equal(formatSent(new Date(2026, 9, 28, 16, 5).toISOString(), now), 'Yesterday, 4:05 PM');
  assert.equal(formatSent(new Date(2026, 9, 20, 0, 5).toISOString(), now), '20 Oct, 12:05 AM');
  assert.equal(formatSent(new Date(2026, 9, 29, 12, 0).toISOString(), now), 'Today, 12:00 PM');
});

test('a missing or invalid time gives an empty string', () => {
  assert.equal(formatSent(null, now), '');
  assert.equal(formatSent('not a date', now), '');
});
