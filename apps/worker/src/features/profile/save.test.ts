import assert from 'node:assert/strict';
import { test } from 'node:test';

import { saveAbout, type AboutValues, type RpcClient } from './save.ts';

const values: AboutValues = {
  fullName: 'Usman Khan',
  phone: '+923214567890',
  gender: 'male',
  dateOfBirth: '1994-03-14',
  cnic: '42101-5678901-3',
};

type Reply = { error: { name?: string; code?: string; message?: string; details?: string | null } | null } | 'throw';

function fakeClient(replies: Record<string, Reply[]>) {
  const calls: string[] = [];
  const client: RpcClient = {
    async rpc(fn) {
      calls.push(fn);
      const reply = replies[fn]?.shift() ?? { error: null };
      if (reply === 'throw') throw new TypeError('Network request failed');
      return reply;
    },
  };
  return { client, calls };
}

test('a new worker is registered once', async () => {
  const { client, calls } = fakeClient({});
  assert.deepEqual(await saveAbout(client, false, values), { ok: true });
  assert.deepEqual(calls, ['register_profile']);
});

test('an existing profile is updated, never registered again', async () => {
  const { client, calls } = fakeClient({});
  assert.deepEqual(await saveAbout(client, true, values), { ok: true });
  assert.deepEqual(calls, ['update_my_profile']);
});

test('"profile already exists" falls back to an update', async () => {
  const { client, calls } = fakeClient({ register_profile: [{ error: { message: 'profile already exists' } }] });
  assert.deepEqual(await saveAbout(client, false, values), { ok: true });
  assert.deepEqual(calls, ['register_profile', 'update_my_profile']);
});

test('a true race (primary key violation) also falls back to an update', async () => {
  const { client, calls } = fakeClient({
    register_profile: [{ error: { code: '23505', message: 'violates unique constraint "profiles_pkey"' } }],
  });
  assert.deepEqual(await saveAbout(client, false, values), { ok: true });
  assert.deepEqual(calls, ['register_profile', 'update_my_profile']);
});

test('a CNIC conflict is a vague error and does not retry', async () => {
  const { client, calls } = fakeClient({
    register_profile: [
      { error: { code: '23505', message: 'violates unique constraint "profiles_cnic_role_unique"', details: 'Key (cnic, role)=(42101-5678901-3, worker)' } },
    ],
  });
  assert.deepEqual(await saveAbout(client, false, values), { ok: false, key: 'about.errors.cnicUnavailable' });
  assert.deepEqual(calls, ['register_profile']);
});

test('a thrown network failure maps to the network message without its text', async () => {
  const { client } = fakeClient({ register_profile: ['throw'] });
  assert.deepEqual(await saveAbout(client, false, values), { ok: false, key: 'about.errors.network' });
});

test('an update failure after the fallback is reported', async () => {
  const { client } = fakeClient({
    register_profile: [{ error: { message: 'profile already exists' } }],
    update_my_profile: [{ error: { message: 'name, gender, date of birth and CNIC are locked after approval; contact DHA staff' } }],
  });
  assert.deepEqual(await saveAbout(client, false, values), { ok: false, key: 'about.errors.locked' });
});

test('the values are sent as the database expects them', async () => {
  const seen: Record<string, unknown>[] = [];
  const client: RpcClient = {
    async rpc(_fn, args) {
      seen.push(args);
      return { error: null };
    },
  };
  await saveAbout(client, false, values);
  assert.deepEqual(seen[0], {
    p_role: 'worker',
    p_full_name: 'Usman Khan',
    p_phone: '+923214567890',
    p_gender: 'male',
    p_date_of_birth: '1994-03-14',
    p_cnic: '42101-5678901-3',
  });
});
