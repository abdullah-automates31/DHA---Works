import assert from 'node:assert/strict';
import { test } from 'node:test';

import { introductionErrorKey, saveIntroduction, type IntroductionClient } from './introduction.ts';
import { ABOUT_MAX, aboutChanged, limitAbout } from './rules.ts';

function fake(overrides: Partial<IntroductionClient> = {}) {
  const calls: string[] = [];
  const client: IntroductionClient = {
    async updateDetails(a) {
      calls.push(`details:${a.voicePath}:${a.about}`);
      return { error: null };
    },
    async uploadVoice() {
      calls.push('upload');
      return { path: 'u/voice-new.m4a', error: null };
    },
    async deleteVoice(path) {
      calls.push(`delete:${path}`);
    },
    ...overrides,
  };
  return { client, calls };
}

test('text only: one details call, no upload', async () => {
  const { client, calls } = fake();
  assert.deepEqual(await saveIntroduction(client, { newVoice: null, previousVoicePath: 'u/old.m4a', about: 'Hello' }), { ok: true, voicePath: null });
  assert.deepEqual(calls, ['details:null:Hello']);
});

test('nothing changed: no calls at all', async () => {
  const { client, calls } = fake();
  assert.deepEqual(await saveIntroduction(client, { newVoice: null, previousVoicePath: null, about: null }), { ok: true, voicePath: null });
  assert.deepEqual(calls, []);
});

test('an empty string is sent so the text can be cleared', async () => {
  const { client, calls } = fake();
  await saveIntroduction(client, { newVoice: null, previousVoicePath: null, about: '' });
  assert.deepEqual(calls, ['details:null:']);
});

test('new voice: upload, save, then delete the old file', async () => {
  const { client, calls } = fake();
  const result = await saveIntroduction(client, { newVoice: new ArrayBuffer(10), previousVoicePath: 'u/old.m4a', about: 'Hi' });
  assert.deepEqual(result, { ok: true, voicePath: 'u/voice-new.m4a' });
  assert.deepEqual(calls, ['upload', 'details:u/voice-new.m4a:Hi', 'delete:u/old.m4a']);
});

test('an upload failure stops before the profile is touched', async () => {
  const { client, calls } = fake({ uploadVoice: async () => ({ path: null, error: { message: 'boom' } }) });
  const result = await saveIntroduction(client, { newVoice: new ArrayBuffer(10), previousVoicePath: 'u/old.m4a', about: 'Hi' });
  assert.deepEqual(result, { ok: false, key: 'introduction.errors.voice' });
  assert.deepEqual(calls, []);
});

test('a failed save removes the new file and keeps the old one', async () => {
  const { client, calls } = fake({
    updateDetails: async () => ({ error: { message: 'fetch failed' } }),
  });
  const result = await saveIntroduction(client, { newVoice: new ArrayBuffer(10), previousVoicePath: 'u/old.m4a', about: null });
  assert.deepEqual(result, { ok: false, key: 'introduction.errors.network' });
  assert.deepEqual(calls, ['upload', 'delete:u/voice-new.m4a']);
});

test('a thrown TypeError is a network problem', async () => {
  const { client } = fake({
    updateDetails: async () => {
      throw new TypeError('Network request failed');
    },
  });
  assert.deepEqual(await saveIntroduction(client, { newVoice: null, previousVoicePath: null, about: 'x' }), {
    ok: false,
    key: 'introduction.errors.network',
  });
});

test('error keys', () => {
  assert.equal(introductionErrorKey({ message: 'Network request failed' }), 'introduction.errors.network');
  assert.equal(introductionErrorKey({ message: 'new row violates check constraint' }), 'introduction.errors.generic');
  assert.equal(introductionErrorKey(null), 'introduction.errors.generic');
});

test('about text: limit and change detection', () => {
  assert.equal(limitAbout('a'.repeat(ABOUT_MAX + 20)).length, ABOUT_MAX);
  assert.equal(limitAbout('short'), 'short');
  assert.equal(aboutChanged('  ', null), false);
  assert.equal(aboutChanged('Hello ', 'Hello'), false);
  assert.equal(aboutChanged('Hello', null), true);
  assert.equal(aboutChanged('', 'Hello'), true);
});
