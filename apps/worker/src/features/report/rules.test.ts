import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_PHOTOS, REPORT_CHOICES, buildPhotoPath, checkPhoto, checkReport, fileReport, initialChoice, reportErrorKey, reportText, tidyDetails } from './rules.ts';

const png = (n = 100) => ({ bytes: new ArrayBuffer(n), mime: 'image/png' });

test('the five choices map to report kinds', () => {
  assert.deepEqual(
    REPORT_CHOICES.map((c) => [c.label, c.kind]),
    [['Customer rude', 'rude_damage'], ['I felt unsafe', 'unsafe'], ['Not at home', 'no_show'], ['Refused to pay', 'cash_price'], ['Other', 'other']],
  );
});

test('the red unsafe button opens the screen on I felt unsafe', () => {
  assert.equal(initialChoice('unsafe'), 'unsafe');
  assert.equal(initialChoice(undefined), null);
  assert.equal(initialChoice('rude'), null);
});

test('a reason is required, and Other needs a few words', () => {
  assert.deepEqual(checkReport(null, 'text'), { ok: false, missing: 'choice' });
  assert.deepEqual(checkReport('rude', ''), { ok: true });
  assert.deepEqual(checkReport('other', '  hi '), { ok: false, missing: 'details' });
  assert.deepEqual(checkReport('other', 'He changed the work'), { ok: true });
});

test('the stored text keeps the chosen reason and the worker\'s words', () => {
  assert.equal(reportText('unpaid', ''), 'Refused to pay');
  assert.equal(reportText('unpaid', '  He   changed the work  '), 'Refused to pay: He changed the work');
  assert.equal(tidyDetails('x'.repeat(1500)).length, 1000);
});

test('photos must be small images', () => {
  assert.deepEqual(checkPhoto('image/jpeg', 10), { ok: true, extension: 'jpg' });
  assert.deepEqual(checkPhoto('application/pdf', 10), { ok: false, key: 'report.errors.photoType' });
  assert.deepEqual(checkPhoto('image/png', 6 * 1024 * 1024), { ok: false, key: 'report.errors.photoSize' });
  assert.deepEqual(checkPhoto('image/png', 0), { ok: false, key: 'report.errors.photoEmpty' });
  assert.equal(buildPhotoPath('u1', 'j1', 'png', 5, 'ab'), 'u1/j1-5-ab.png');
});

test('database refusals map to friendly keys', () => {
  assert.equal(reportErrorKey({ message: 'the reporting period for this job has ended' }), 'report.errors.ended');
  assert.equal(reportErrorKey({ message: 'reports are possible once the job is scheduled' }), 'report.errors.notAllowed');
  assert.equal(reportErrorKey({ message: 'job not found' }), 'report.errors.notAllowed');
  assert.equal(reportErrorKey({ message: 'your account is suspended' }), 'report.errors.suspended');
  assert.equal(reportErrorKey({ name: 'TypeError', message: 'x' }), 'report.errors.network');
  assert.equal(reportErrorKey({ message: 'weird' }), 'report.errors.generic');
});

test('photos are uploaded first, then the report is filed with their paths', async () => {
  const calls: string[] = [];
  const client = {
    uploadPhoto: async (path: string) => (calls.push('up:' + path), { error: null }),
    file: async (job: string, kind: string, text: string, paths: string[]) => (calls.push(`file:${job}:${kind}:${text}:${paths.join('|')}`), { error: null }),
  };
  const result = await fileReport(client, { userId: 'u1', jobId: 'j1', choice: 'unpaid', details: 'He refused', photos: [png(), png()], now: 100, random: () => 'r' });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, ['up:u1/j1-100-r.png', 'up:u1/j1-101-r.png', 'file:j1:cash_price:Refused to pay: He refused:u1/j1-100-r.png|u1/j1-101-r.png']);
});

test('a bad photo or too many photos stop everything before anything is sent', async () => {
  const client = { uploadPhoto: async () => { throw new Error('must not upload'); }, file: async () => { throw new Error('must not file'); } };
  assert.deepEqual(await fileReport(client, { userId: 'u', jobId: 'j', choice: 'rude', details: '', photos: [{ bytes: new ArrayBuffer(5), mime: 'application/pdf' }] }), { ok: false, key: 'report.errors.photoType' });
  assert.deepEqual(await fileReport(client, { userId: 'u', jobId: 'j', choice: 'rude', details: '', photos: Array.from({ length: MAX_PHOTOS + 1 }, () => png()) }), { ok: false, key: 'report.errors.photoSize' });
});

test('an upload failure files nothing; a database refusal is reported', async () => {
  let filed = false;
  const failing = { uploadPhoto: async () => ({ error: { message: 'boom' } }), file: async () => ((filed = true), { error: null }) };
  assert.deepEqual(await fileReport(failing, { userId: 'u', jobId: 'j', choice: 'rude', details: '', photos: [png()] }), { ok: false, key: 'report.errors.photoUpload' });
  assert.equal(filed, false);
  const refused = { uploadPhoto: async () => ({ error: null }), file: async () => ({ error: { message: 'the reporting period for this job has ended' } }) };
  assert.deepEqual(await fileReport(refused, { userId: 'u', jobId: 'j', choice: 'rude', details: '', photos: [] }), { ok: false, key: 'report.errors.ended' });
  const down = { uploadPhoto: async () => ({ error: null }), file: async () => { throw new TypeError('Network request failed'); } };
  assert.deepEqual(await fileReport(down, { userId: 'u', jobId: 'j', choice: 'rude', details: '', photos: [] }), { ok: false, key: 'report.errors.network' });
});
