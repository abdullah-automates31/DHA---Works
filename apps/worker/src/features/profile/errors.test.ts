import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isAlreadyRegistered, profileErrorKey } from './errors.ts';

test('a CNIC conflict gives a vague message and never the value', () => {
  const key = profileErrorKey({
    code: '23505',
    message: 'duplicate key value violates unique constraint "profiles_cnic_role_unique"',
    details: 'Key (cnic, role)=(42101-5678901-3, worker) already exists.',
  });
  assert.equal(key, 'about.errors.cnicUnavailable');
  assert.ok(!key.includes('42101'));
});

test('format and length constraints map to field messages', () => {
  assert.equal(
    profileErrorKey({ code: '23514', message: 'new row for relation "profiles" violates check constraint "profiles_cnic_format"' }),
    'about.errors.cnicRejected',
  );
  assert.equal(
    profileErrorKey({ code: '23514', message: 'violates check constraint "profiles_phone_length"' }),
    'about.errors.mobileRejected',
  );
});

test('the identity lock maps to the locked message', () => {
  assert.equal(
    profileErrorKey({ message: 'name, gender, date of birth and CNIC are locked after approval; contact DHA staff' }),
    'about.errors.locked',
  );
});

test('network failures and unknown errors', () => {
  assert.equal(profileErrorKey({ name: 'TypeError', message: 'Network request failed' }), 'about.errors.network');
  assert.equal(profileErrorKey({ message: 'something internal 42101-5678901-3' }), 'about.errors.generic');
  assert.equal(profileErrorKey(null), 'about.errors.generic');
});

test('a true race (primary key violation) counts as already registered, not as a CNIC conflict', () => {
  const race = { code: '23505', message: 'duplicate key value violates unique constraint "profiles_pkey"', details: 'Key (id)=(abc) already exists.' };
  assert.equal(isAlreadyRegistered(race), true);
  assert.notEqual(profileErrorKey(race), 'about.errors.cnicUnavailable');
});

test('an existing profile is recognised so a repeat request can fall back to an update', () => {
  assert.equal(isAlreadyRegistered({ message: 'profile already exists' }), true);
  assert.equal(isAlreadyRegistered({ message: 'Profile Already Exists' }), true);
  assert.equal(isAlreadyRegistered({ message: 'something else' }), false);
  assert.equal(isAlreadyRegistered(null), false);
});
