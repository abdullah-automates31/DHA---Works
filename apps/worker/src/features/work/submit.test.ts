import assert from 'node:assert/strict';
import { test } from 'node:test';

import { submitApplication, submitErrorKey, type SubmitClient, type SubmitInput } from './submit.ts';

const input: SubmitInput = { tradeIds: [1, 3], years: 6, fee: 800, newVoice: null, previousVoicePath: null };

function fake(overrides: Partial<SubmitClient> = {}) {
  const calls: string[] = [];
  const client: SubmitClient = {
    async setCategories(ids) {
      calls.push(`categories:${ids.join(',')}`);
      return { error: null };
    },
    async updateDetails(a) {
      calls.push(`details:${a.years}:${a.fee}:${a.voicePath}`);
      return { error: null };
    },
    async uploadVoice() {
      calls.push('uploadVoice');
      return { path: 'u/voice-new.m4a', error: null };
    },
    async deleteVoice(path) {
      calls.push(`deleteVoice:${path}`);
    },
    async submit() {
      calls.push('submit');
      return { error: null };
    },
    ...overrides,
  };
  return { client, calls };
}

test('without a recording: trades, details, submit', async () => {
  const { client, calls } = fake();
  assert.deepEqual(await submitApplication(client, input), { ok: true });
  assert.deepEqual(calls, ['categories:1,3', 'details:6:800:null', 'submit']);
});

test('a new recording is uploaded before the details, and the old file is deleted afterwards', async () => {
  const { client, calls } = fake();
  const r = await submitApplication(client, { ...input, newVoice: new ArrayBuffer(10), previousVoicePath: 'u/voice-old.m4a' });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(calls, ['categories:1,3', 'uploadVoice', 'details:6:800:u/voice-new.m4a', 'deleteVoice:u/voice-old.m4a', 'submit']);
});

test('blank experience and fee are sent as "unchanged"', async () => {
  const { client, calls } = fake();
  await submitApplication(client, { ...input, years: null, fee: null });
  assert.ok(calls.includes('details:null:null:null'));
});

test('nothing after a failing step runs', async () => {
  const { client, calls } = fake({
    async setCategories() {
      return { error: { message: 'choose at least one trade' } };
    },
  });
  assert.deepEqual(await submitApplication(client, input), { ok: false, key: 'work.errors.trades' });
  assert.deepEqual(calls, []);
});

test('a failed voice upload stops before the details are touched', async () => {
  const { client, calls } = fake({
    async uploadVoice() {
      return { path: null, error: { message: 'boom' } };
    },
  });
  assert.deepEqual(await submitApplication(client, { ...input, newVoice: new ArrayBuffer(10) }), { ok: false, key: 'work.errors.voice' });
  assert.deepEqual(calls, ['categories:1,3']);
});

test('the old voice file is kept when the new details were not saved', async () => {
  const { client, calls } = fake({
    async updateDetails() {
      return { error: { message: 'invalid file path' } };
    },
  });
  await submitApplication(client, { ...input, newVoice: new ArrayBuffer(10), previousVoicePath: 'u/voice-old.m4a' });
  assert.ok(!calls.some((c) => c.startsWith('deleteVoice')));
});

test('a failing delete of the old file does not fail the submission', async () => {
  const { client } = fake({
    async deleteVoice() {
      throw new Error('gone');
    },
  });
  assert.deepEqual(await submitApplication(client, { ...input, newVoice: new ArrayBuffer(10), previousVoicePath: 'u/voice-old.m4a' }), { ok: true });
});

test('"already submitted" counts as success (repeat tap)', async () => {
  const { client } = fake({
    async submit() {
      return { error: { message: 'already submitted' } };
    },
  });
  assert.deepEqual(await submitApplication(client, input), { ok: true });
});

test('missing documents or identity map to friendly keys', async () => {
  assert.equal(submitErrorKey({ message: 'upload both sides of your CNIC' }), 'work.errors.documents');
  assert.equal(submitErrorKey({ message: 'upload a profile photo' }), 'work.errors.documents');
  assert.equal(submitErrorKey({ message: 'upload a police certificate or give two references' }), 'work.errors.documents');
  assert.equal(submitErrorKey({ message: 'name, phone and CNIC are required' }), 'work.errors.identity');
  assert.equal(submitErrorKey({ message: 'weird internal 42101-5678901-3' }), 'work.errors.generic');
});

test('a thrown network error maps to the network message', async () => {
  const { client } = fake({
    async setCategories() {
      throw new TypeError('Network request failed');
    },
  });
  assert.deepEqual(await submitApplication(client, input), { ok: false, key: 'work.errors.network' });
});
