import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signOutOtherDevices, type DevicesClient } from './devices.ts';

test('asks the server to end only the other sessions', async () => {
  let seen: unknown = null;
  const client: DevicesClient = { auth: { signOut: async (o) => { seen = o; return { error: null }; } } };
  assert.deepEqual(await signOutOtherDevices(client), { ok: true });
  assert.deepEqual(seen, { scope: 'others' });
});

test('a server error or a network failure is reported as not done', async () => {
  const refused: DevicesClient = { auth: { signOut: async () => ({ error: { message: 'x' } }) } };
  const offline: DevicesClient = { auth: { signOut: async () => { throw new Error('network'); } } };
  assert.deepEqual(await signOutOtherDevices(refused), { ok: false });
  assert.deepEqual(await signOutOtherDevices(offline), { ok: false });
});
