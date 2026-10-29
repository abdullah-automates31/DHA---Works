import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allowedRoutes, identityComplete, statusKind, type ProfileSnapshot } from './routing.ts';

const base: ProfileSnapshot = {
  role: 'worker',
  verification_status: 'incomplete',
  account_status: 'active',
  full_name: 'Usman Khan',
  phone: '+923214567890',
  cnic: '42101-5678901-3',
  gender: 'male',
  date_of_birth: '1994-03-14',
};
const with_ = (patch: Partial<ProfileSnapshot>): ProfileSnapshot => ({ ...base, ...patch });

test('no profile yet goes to About you', () => {
  assert.deepEqual(allowedRoutes(null), ['/about']);
  assert.equal(statusKind(null), null);
});

test('an incomplete identity stays on About you; a complete one moves on and may still edit', () => {
  assert.deepEqual(allowedRoutes(with_({ cnic: null })), ['/about']);
  assert.deepEqual(allowedRoutes(with_({ date_of_birth: null })), ['/about']);
  assert.deepEqual(allowedRoutes(base), ['/documents', '/references', '/work', '/about']);
  assert.deepEqual(allowedRoutes(with_({ verification_status: 'needs_changes' })), ['/documents', '/references', '/work', '/about']);
});

test('under review, visit HQ and rejected show the status screen', () => {
  for (const s of ['pending', 'visit_hq', 'rejected'] as const) {
    assert.deepEqual(allowedRoutes(with_({ verification_status: s })), ['/status'], s);
    assert.equal(statusKind(with_({ verification_status: s })), s);
  }
});

test('approved without areas must choose areas first; with areas goes home and may change them', () => {
  const approved = with_({ verification_status: 'approved' });
  assert.deepEqual(allowedRoutes(approved), ['/areas']);
  assert.deepEqual(allowedRoutes(approved, 0), ['/areas']);
  assert.deepEqual(allowedRoutes(approved, 3), ['/home', '/open-jobs', '/my-jobs', '/profile', '/notifications', '/areas']);
});

test('areas do not matter before approval', () => {
  assert.deepEqual(allowedRoutes(with_({ verification_status: 'pending' }), 5), ['/status']);
  assert.deepEqual(allowedRoutes(base, 5), ['/documents', '/references', '/work', '/about']);
});

test('a suspended or wrong-role account never reaches the tabs', () => {
  assert.deepEqual(allowedRoutes(with_({ verification_status: 'approved', account_status: 'suspended' }), 3), ['/status']);
  assert.deepEqual(allowedRoutes(with_({ verification_status: 'approved', role: 'resident' }), 3), ['/status']);
});

test('a suspended account is blocked whatever its status', () => {
  for (const s of ['incomplete', 'pending', 'approved'] as const) {
    const p = with_({ verification_status: s, account_status: 'suspended' });
    assert.deepEqual(allowedRoutes(p), ['/status'], s);
    assert.equal(statusKind(p), 'suspended');
  }
});

test('a customer or staff account cannot use the worker app', () => {
  for (const role of ['resident', 'admin'] as const) {
    assert.deepEqual(allowedRoutes(with_({ role })), ['/status']);
    assert.equal(statusKind(with_({ role })), 'wrong_role');
  }
});

test('wrong role wins over suspension and status', () => {
  assert.equal(statusKind(with_({ role: 'resident', account_status: 'suspended', verification_status: 'rejected' })), 'wrong_role');
});

test('identityComplete needs all five fields', () => {
  assert.equal(identityComplete(base), true);
  for (const key of ['full_name', 'phone', 'cnic', 'gender', 'date_of_birth'] as const) {
    assert.equal(identityComplete(with_({ [key]: null })), false, key);
    assert.equal(identityComplete(with_({ [key]: '' })), false, key);
  }
});
