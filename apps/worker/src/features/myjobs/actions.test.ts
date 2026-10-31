import assert from 'node:assert/strict';
import { test } from 'node:test';

import { actionErrorKey, buildBillPath, checkBill, completeJob, startJob, type ActionClient } from './actions.ts';

const bytes = (n: number) => new ArrayBuffer(n);

function fake(overrides: Partial<ActionClient> = {}) {
  const calls: string[] = [];
  const client: ActionClient = {
    async startJob(id) {
      calls.push(`start:${id}`);
      return { error: null };
    },
    async completeJob(id, path) {
      calls.push(`complete:${id}:${path}`);
      return { error: null };
    },
    async uploadBill(_b, mime, ext) {
      calls.push(`upload:${mime}:${ext}`);
      return { path: `u/bill-1-aa.${ext}`, error: null };
    },
    async deleteBill(path) {
      calls.push(`delete:${path}`);
    },
    ...overrides,
  };
  return { client, calls };
}

test('database refusals map to friendly keys', () => {
  assert.equal(actionErrorKey({ message: 'this job cannot be started' }), 'myjobs.errors.cannotStart');
  assert.equal(actionErrorKey({ message: 'this job cannot be completed' }), 'myjobs.errors.cannotComplete');
  assert.equal(actionErrorKey({ message: 'upload the material bill' }), 'myjobs.errors.billRequired');
  assert.equal(actionErrorKey({ message: 'invalid bill path' }), 'myjobs.errors.billInvalid');
  assert.equal(actionErrorKey({ name: 'TypeError', message: 'Network request failed' }), 'myjobs.errors.network');
  assert.equal(actionErrorKey({ message: 'weird' }), 'myjobs.errors.generic');
  assert.equal(actionErrorKey(null), 'myjobs.errors.generic');
});

test('a bill is a photo up to 5 MB', () => {
  assert.deepEqual(checkBill('image/jpeg', 1000), { ok: true, extension: 'jpg' });
  assert.deepEqual(checkBill('IMAGE/PNG', 1000), { ok: true, extension: 'png' });
  assert.deepEqual(checkBill('application/pdf', 1000), { ok: false, key: 'myjobs.errors.billType' });
  assert.deepEqual(checkBill(null, 1000), { ok: false, key: 'myjobs.errors.billType' });
  assert.deepEqual(checkBill('image/jpeg', 0), { ok: false, key: 'myjobs.errors.billUpload' });
  assert.deepEqual(checkBill('image/jpeg', 5 * 1024 * 1024 + 1), { ok: false, key: 'myjobs.errors.billSize' });
});

test('the bill path starts with the worker id and is new every time', () => {
  assert.equal(buildBillPath('w1', 'jpg', 5, 'ab'), 'w1/bill-5-ab.jpg');
  assert.notEqual(buildBillPath('w1', 'jpg', 5, 'ab'), buildBillPath('w1', 'jpg', 6, 'cd'));
});

test('start job calls the database once and reports refusals', async () => {
  const { client, calls } = fake();
  assert.deepEqual(await startJob(client, 'j1'), { ok: true });
  assert.deepEqual(calls, ['start:j1']);
  const refused = fake({ startJob: async () => ({ error: { message: 'this job cannot be started' } }) });
  assert.deepEqual(await startJob(refused.client, 'j1'), { ok: false, key: 'myjobs.errors.cannotStart' });
});

test('completing without materials needs no bill and uploads nothing', async () => {
  const { client, calls } = fake();
  assert.deepEqual(await completeJob(client, { jobId: 'j1', materials: 0, bill: null }), { ok: true });
  assert.deepEqual(calls, ['complete:j1:null']);
});

test('materials above zero require the bill before anything is sent', async () => {
  const { client, calls } = fake();
  assert.deepEqual(await completeJob(client, { jobId: 'j1', materials: 1450, bill: null }), { ok: false, key: 'myjobs.errors.billRequired' });
  assert.deepEqual(calls, []);
});

test('the bill is uploaded first, then the job is completed with its path', async () => {
  const { client, calls } = fake();
  const r = await completeJob(client, { jobId: 'j1', materials: 1450, bill: { bytes: bytes(2000), mime: 'image/jpeg' } });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(calls, ['upload:image/jpeg:jpg', 'complete:j1:u/bill-1-aa.jpg']);
});

test('a bad bill file is refused before upload', async () => {
  const { client, calls } = fake();
  assert.deepEqual(await completeJob(client, { jobId: 'j1', materials: 1, bill: { bytes: bytes(10), mime: 'application/pdf' } }), { ok: false, key: 'myjobs.errors.billType' });
  assert.deepEqual(await completeJob(client, { jobId: 'j1', materials: 1, bill: { bytes: bytes(6 * 1024 * 1024), mime: 'image/png' } }), { ok: false, key: 'myjobs.errors.billSize' });
  assert.deepEqual(calls, []);
});

test('a failed upload stops before the job is touched', async () => {
  const { client, calls } = fake({ uploadBill: async () => ({ path: null, error: { message: 'boom' } }) });
  assert.deepEqual(await completeJob(client, { jobId: 'j1', materials: 1, bill: { bytes: bytes(10), mime: 'image/jpeg' } }), { ok: false, key: 'myjobs.errors.billUpload' });
  assert.deepEqual(calls, []);
});

test('if the job cannot be completed the uploaded bill is removed again', async () => {
  const { client, calls } = fake({ completeJob: async () => ({ error: { message: 'this job cannot be completed' } }) });
  const r = await completeJob(client, { jobId: 'j1', materials: 1, bill: { bytes: bytes(10), mime: 'image/jpeg' } });
  assert.deepEqual(r, { ok: false, key: 'myjobs.errors.cannotComplete' });
  assert.deepEqual(calls, ['upload:image/jpeg:jpg', 'delete:u/bill-1-aa.jpg']);
});

test('a lost connection is a network message, not a crash', async () => {
  const down = fake({
    startJob: async () => {
      throw new TypeError('Network request failed');
    },
  });
  assert.deepEqual(await startJob(down.client, 'j1'), { ok: false, key: 'myjobs.errors.network' });
});
