import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WORKER_REASONS, cancelErrorKey, isWorkerReason, requestCancellation, tidyDetails, withdrawCancellation } from './rules.ts';

test('the worker is offered five reasons, not the customer-only one', () => {
  assert.deepEqual([...WORKER_REASONS], ['schedule_conflict', 'price_dispute', 'safety_concern', 'worker_unavailable', 'other']);
  assert.equal(isWorkerReason('no_longer_needed'), false);
  assert.equal(isWorkerReason('safety_concern'), true);
  assert.equal(isWorkerReason(null), false);
});

test('details are optional and tidied', () => {
  assert.equal(tidyDetails(''), null);
  assert.equal(tidyDetails('   \n '), null);
  assert.equal(tidyDetails('  Car   broke  down '), 'Car broke down');
  assert.equal(tidyDetails('x'.repeat(900))?.length, 500);
});

test('database refusals map to friendly keys', () => {
  assert.equal(cancelErrorKey({ message: 'a cancellation request is already waiting for review' }), 'cancel.errors.alreadyPending');
  assert.equal(cancelErrorKey({ message: 'cancellation can be requested while the job is scheduled or in progress' }), 'cancel.errors.notAllowed');
  assert.equal(cancelErrorKey({ message: 'job not found' }), 'cancel.errors.notAllowed');
  assert.equal(cancelErrorKey({ message: 'your account is suspended' }), 'cancel.errors.suspended');
  assert.equal(cancelErrorKey({ message: 'no pending request found' }), 'cancel.errors.noPending');
  assert.equal(cancelErrorKey({ name: 'TypeError', message: 'x' }), 'cancel.errors.network');
  assert.equal(cancelErrorKey({ message: 'weird' }), 'cancel.errors.generic');
});

test('a request carries the reason and tidied details; blank details are left out', async () => {
  const seen: unknown[] = [];
  const client = {
    request: async (id: string, r: string, d: string | null) => (seen.push([id, r, d]), { error: null }),
    withdraw: async () => ({ error: null }),
  };
  assert.deepEqual(await requestCancellation(client, 'j1', 'schedule_conflict', '  Car   broke down '), { ok: true });
  assert.deepEqual(await requestCancellation(client, 'j1', 'other', '   '), { ok: true });
  assert.deepEqual(seen, [['j1', 'schedule_conflict', 'Car broke down'], ['j1', 'other', null]]);
});

test('refusals are returned, never thrown', async () => {
  const pending = {
    request: async () => ({ error: { message: 'a cancellation request is already waiting for review' } }),
    withdraw: async () => ({ error: { message: 'no pending request found' } }),
  };
  assert.deepEqual(await requestCancellation(pending, 'j1', 'other', ''), { ok: false, key: 'cancel.errors.alreadyPending' });
  assert.deepEqual(await withdrawCancellation(pending, 'r1'), { ok: false, key: 'cancel.errors.noPending' });
  const down = {
    request: async () => {
      throw new TypeError('Network request failed');
    },
    withdraw: async () => ({ error: null }),
  };
  assert.deepEqual(await requestCancellation(down, 'j1', 'other', ''), { ok: false, key: 'cancel.errors.network' });
  assert.deepEqual(await withdrawCancellation(down, 'r1'), { ok: true });
});
