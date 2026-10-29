import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAX_FILE_BYTES,
  allowedMimes,
  bucketFor,
  buildPath,
  checkFile,
  fitWithin,
  initials,
  missingItems,
  summarize,
} from './files.ts';

test('buckets: staff-only identity for CNIC and certificate, worker-media for the photo', () => {
  assert.equal(bucketFor('cnic_front'), 'identity');
  assert.equal(bucketFor('cnic_back'), 'identity');
  assert.equal(bucketFor('police_cert'), 'identity');
  assert.equal(bucketFor('profile_photo'), 'worker-media');
});

test('only the police certificate may be a PDF', () => {
  assert.ok(allowedMimes('police_cert').includes('application/pdf'));
  for (const t of ['cnic_front', 'cnic_back', 'profile_photo'] as const) {
    assert.ok(!allowedMimes(t).includes('application/pdf'), t);
  }
});

test('file checks: type, size and empty', () => {
  assert.deepEqual(checkFile('cnic_front', 'image/jpeg', 1000), { ok: true, extension: 'jpg' });
  assert.deepEqual(checkFile('police_cert', 'application/pdf', 1000), { ok: true, extension: 'pdf' });
  assert.deepEqual(checkFile('cnic_front', 'application/pdf', 1000), { ok: false, reason: 'type' });
  assert.deepEqual(checkFile('cnic_front', 'image/heic', 1000), { ok: false, reason: 'type' });
  assert.deepEqual(checkFile('cnic_front', null, 1000), { ok: false, reason: 'type' });
  assert.deepEqual(checkFile('cnic_front', 'image/jpeg', 0), { ok: false, reason: 'empty' });
  assert.deepEqual(checkFile('cnic_front', 'image/jpeg', MAX_FILE_BYTES), { ok: true, extension: 'jpg' });
  assert.deepEqual(checkFile('cnic_front', 'image/jpeg', MAX_FILE_BYTES + 1), { ok: false, reason: 'size' });
  assert.deepEqual(checkFile('cnic_front', 'IMAGE/JPEG', 10), { ok: true, extension: 'jpg' });
});

test('paths start with the user id, never contain a file name, and differ per upload', () => {
  const a = buildPath('11111111-1111-1111-1111-111111111111', 'cnic_front', 'jpg', 1700000000000, 'ab12');
  const b = buildPath('11111111-1111-1111-1111-111111111111', 'cnic_front', 'jpg', 1700000000001, 'cd34');
  assert.equal(a, '11111111-1111-1111-1111-111111111111/cnic_front-1700000000000-ab12.jpg');
  assert.ok(a.startsWith('11111111-1111-1111-1111-111111111111/'));
  assert.notEqual(a, b);
});

test('images are scaled down to 1600 on the longest side and never scaled up', () => {
  assert.deepEqual(fitWithin(4032, 3024), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(3024, 4032), { width: 1200, height: 1600 });
  assert.equal(fitWithin(1600, 900), null);
  assert.equal(fitWithin(800, 600), null);
});

test('missing items match submit_for_review', () => {
  assert.deepEqual(missingItems(summarize([], 0)), ['cnic_front', 'cnic_back', 'profile_photo', 'police_or_references']);
  assert.deepEqual(missingItems(summarize(['cnic_front', 'cnic_back', 'profile_photo', 'police_cert'], 0)), []);
  assert.deepEqual(missingItems(summarize(['cnic_front', 'cnic_back', 'profile_photo'], 2)), []);
  assert.deepEqual(missingItems(summarize(['cnic_front', 'cnic_back', 'profile_photo'], 1)), ['police_or_references']);
  assert.deepEqual(missingItems(summarize(['cnic_back', 'profile_photo', 'police_cert'], 0)), ['cnic_front']);
});

test('initials for the placeholder avatar', () => {
  assert.equal(initials('Usman Khan'), 'UK');
  assert.equal(initials('  syed   abdullah ali '), 'SA');
  assert.equal(initials('Madonna'), 'M');
  assert.equal(initials(''), '');
  assert.equal(initials(null), '');
});
