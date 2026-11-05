import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mergeById, nearEnd, splitPage } from './paging.ts';

test('mergeById appends new rows and never repeats a row', () => {
  const merged = mergeById([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]);
  assert.deepEqual(merged.map((r) => r.id), ['a', 'b', 'c']);
});

test('mergeById keeps the order of what is already shown and refreshes a repeated row in place', () => {
  const merged = mergeById([{ id: 'a', v: 1 }, { id: 'b', v: 1 }], [{ id: 'b', v: 2 }, { id: 'a', v: 2 }]);
  assert.deepEqual(merged, [{ id: 'a', v: 2 }, { id: 'b', v: 2 }]);
});

test('mergeById handles empty sides and does not change its inputs', () => {
  const current = [{ id: 'a' }];
  assert.deepEqual(mergeById([], [{ id: 'x' }]), [{ id: 'x' }]);
  assert.deepEqual(mergeById(current, []), [{ id: 'a' }]);
  mergeById(current, [{ id: 'b' }]);
  assert.deepEqual(current, [{ id: 'a' }]);
});

test('mergeById drops a duplicate inside the incoming page itself', () => {
  assert.deepEqual(mergeById([], [{ id: 'a' }, { id: 'a' }]).length, 1);
});

test('splitPage: an extra row means another page exists and is not shown', () => {
  assert.deepEqual(splitPage([1, 2, 3], 2), { rows: [1, 2], hasMore: true });
  assert.deepEqual(splitPage([1, 2], 2), { rows: [1, 2], hasMore: false });
  assert.deepEqual(splitPage([1], 2), { rows: [1], hasMore: false });
  assert.deepEqual(splitPage([], 2), { rows: [], hasMore: false });
});

test('nearEnd fires inside the threshold and not before', () => {
  const at = (y: number) => ({ layoutMeasurement: { height: 800 }, contentOffset: { y }, contentSize: { height: 3000 } });
  assert.equal(nearEnd(at(0)), false);
  assert.equal(nearEnd(at(1500)), false);
  assert.equal(nearEnd(at(1600)), true); // 800 + 1600 = 2400 = 3000 - 600
  assert.equal(nearEnd(at(2200)), true);
});

test('nearEnd stays quiet before anything has been laid out', () => {
  assert.equal(nearEnd({ layoutMeasurement: { height: 800 }, contentOffset: { y: 0 }, contentSize: { height: 0 } }), false);
});
