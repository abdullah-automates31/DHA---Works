import assert from 'node:assert/strict';
import { test } from 'node:test';

import { uploadDocument, type StorageClient } from './upload.ts';

const USER = '11111111-1111-1111-1111-111111111111';
const bytes = (n: number) => new ArrayBuffer(n);

function fake(overrides: Partial<StorageClient> = {}) {
  const calls: string[] = [];
  const client: StorageClient = {
    async upload(bucket, path) {
      calls.push(`upload:${bucket}:${path}`);
      return { error: null };
    },
    async record(type, path) {
      calls.push(`record:${type}:${path}`);
      return { error: null };
    },
    ...overrides,
  };
  return { client, calls };
}

test('uploads first, then records the row, in the right bucket', async () => {
  const { client, calls } = fake();
  const r = await uploadDocument(client, { userId: USER, type: 'cnic_front', mime: 'image/jpeg', bytes: bytes(100), now: 5, random: 'ab' });
  assert.deepEqual(r, { ok: true, path: `${USER}/cnic_front-5-ab.jpg` });
  assert.deepEqual(calls, [`upload:identity:${USER}/cnic_front-5-ab.jpg`, `record:cnic_front:${USER}/cnic_front-5-ab.jpg`]);
});

test('the profile photo goes to worker-media', async () => {
  const { client, calls } = fake();
  await uploadDocument(client, { userId: USER, type: 'profile_photo', mime: 'image/png', bytes: bytes(10), now: 1, random: 'z' });
  assert.ok(calls[0]?.startsWith('upload:worker-media:'));
});

test('a bad file is refused before anything is sent', async () => {
  const { client, calls } = fake();
  assert.deepEqual(await uploadDocument(client, { userId: USER, type: 'cnic_back', mime: 'application/pdf', bytes: bytes(10) }), { ok: false, key: 'documents.errors.type' });
  assert.deepEqual(await uploadDocument(client, { userId: USER, type: 'cnic_back', mime: 'image/jpeg', bytes: bytes(6 * 1024 * 1024) }), { ok: false, key: 'documents.errors.size' });
  assert.deepEqual(await uploadDocument(client, { userId: USER, type: 'cnic_back', mime: 'image/jpeg', bytes: bytes(0) }), { ok: false, key: 'documents.errors.empty' });
  assert.deepEqual(calls, []);
});

test('a failed upload does not record anything', async () => {
  const { client, calls } = fake({
    async upload() {
      return { error: { message: 'new row violates row-level security policy' } };
    },
  });
  const r = await uploadDocument(client, { userId: USER, type: 'cnic_front', mime: 'image/jpeg', bytes: bytes(10) });
  assert.deepEqual(r, { ok: false, key: 'documents.errors.locked' });
  assert.deepEqual(calls, []);
});

test('a failed record reports the error (the file stays, the worker retries)', async () => {
  const { client } = fake({
    async record() {
      return { error: { message: 'documents can only be changed before submission or when staff ask for changes' } };
    },
  });
  const r = await uploadDocument(client, { userId: USER, type: 'cnic_front', mime: 'image/jpeg', bytes: bytes(10) });
  assert.deepEqual(r, { ok: false, key: 'documents.errors.locked' });
});

test('a thrown network error maps to the network message without its text', async () => {
  const { client } = fake({
    async upload() {
      throw new TypeError('Network request failed');
    },
  });
  const r = await uploadDocument(client, { userId: USER, type: 'cnic_front', mime: 'image/jpeg', bytes: bytes(10) });
  assert.deepEqual(r, { ok: false, key: 'documents.errors.network' });
});
