import assert from 'node:assert/strict';
import { test } from 'node:test';

import { referenceErrors, validateReferences, type ReferenceInput } from './references.ts';

const a: ReferenceInput = { name: ' Hira  Farooq ', phone: '0321 5550148', address: 'Phase 6,  Lane 7' };
const b: ReferenceInput = { name: 'Bilal Ahmed', phone: '+92 300 1112222', address: 'Phase 5, Lane 2' };

test('two complete references are normalised', () => {
  const r = validateReferences([a, b]);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.payload[0], { name: 'Hira Farooq', phone: '+923215550148', address: 'Phase 6, Lane 7' });
    assert.equal(r.payload[1].phone, '+923001112222');
  }
});

test('an incomplete reference is refused', () => {
  assert.deepEqual(validateReferences([a, { ...b, address: '  ' }]), { ok: false, reason: 'incomplete' });
  assert.deepEqual(validateReferences([a, { ...b, phone: '123' }]), { ok: false, reason: 'incomplete' });
  assert.deepEqual(validateReferences([{ ...a, name: '' }, b]), { ok: false, reason: 'incomplete' });
});

test('the same person twice is refused', () => {
  assert.deepEqual(validateReferences([a, { ...b, phone: '03215550148' }]), { ok: false, reason: 'same' });
});

test('field errors point at what is wrong', () => {
  assert.deepEqual(referenceErrors({ name: '', phone: '1', address: '' }), { name: true, phone: true, address: true });
  assert.deepEqual(referenceErrors(a), {});
});
