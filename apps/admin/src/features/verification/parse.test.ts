import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCounts, parseDetail, parseQueue, safeStoragePath } from './parse.ts';

const ID = '00000000-0000-4000-8000-0000000000b1';

test('a queue reply is parsed row by row and bad rows are dropped', () => {
  const q = parseQueue({
    total: 2,
    rows: [
      { id: ID, full_name: 'Ali Raza', phone: '0321', email: null, waiting_since: '2026-11-06T10:00:00Z', documents: ['cnic_front', 5, 'cnic_back'], extra: { categories: ['Electrical'], phases: [5, 6, 'x'], references: 0, has_voice: true } },
      { id: 'not-a-uuid', full_name: 'Bad' },
      null,
      'text',
      { id: '00000000-0000-4000-8000-0000000000b2', full_name: 'Maryam', extra: { address: { phase: 7, lane: 'Lane 3', plot_no: '45-A' } } },
    ],
  });
  assert.equal(q.total, 2);
  assert.equal(q.rows.length, 2);
  assert.deepEqual(q.rows[0]?.documents, ['cnic_front', 'cnic_back']);
  assert.deepEqual(q.rows[0]?.worker, { categories: ['Electrical'], phases: [5, 6], references: 0, hasVoice: true });
  assert.deepEqual(q.rows[1]?.address, { phase: 7, lane: 'Lane 3', plotNo: '45-A' });
});

test('garbage replies become an empty queue, never an exception', () => {
  for (const bad of [null, undefined, 'x', 5, [], { rows: 'no' }, { total: 'many', rows: {} }]) {
    const q = parseQueue(bad);
    assert.deepEqual(q.rows, []);
    assert.equal(q.total, 0);
  }
});

test('counts keep only numbers', () => {
  assert.deepEqual(parseCounts({ pending: 6, approved: 184, bad: 'x', worse: null }), { pending: 6, approved: 184 });
  assert.deepEqual(parseCounts(null), {});
  assert.deepEqual(parseCounts([1, 2]), {});
});

test('a worker detail is parsed and its documents are limited to known types', () => {
  const d = parseDetail({
    id: ID, role: 'worker', full_name: 'Ali Raza', phone: '0321', email: 'a@b.c', cnic_masked: '42101-*******-7', status: 'pending',
    documents: [{ type: 'cnic_front', path: `${ID}/a.jpg` }, { type: 'passport', path: 'x' }, { type: 'cnic_back', path: '' }, 7],
    history: [{ decision: 'ask_for_changes', reason: 'blurry', decided_at: '2026-11-05T00:00:00Z', decided_by_name: 'Staff' }, { decision: 1 }],
    worker: { experience_years: 6, about: 'hello', voice_intro_path: `${ID}/v.m4a` }, categories: ['Electrical'], phases: [5, 6],
    references: [{ name: 'R', phone: '0300' }, { name: 5 }],
  });
  assert.ok(d);
  assert.equal(d.documents.length, 1);
  assert.equal(d.history.length, 1);
  assert.equal(d.worker?.experienceYears, 6);
  assert.equal(d.worker?.references.length, 1);
  assert.deepEqual(d.addresses, []);
});

test('a detail with a wrong id or role is refused', () => {
  assert.equal(parseDetail(null), null);
  assert.equal(parseDetail({ id: 'x', role: 'worker' }), null);
  assert.equal(parseDetail({ id: ID, role: 'admin' }), null);
});

test('storage paths must be "<uuid>/<file>" with nothing clever in them', () => {
  assert.equal(safeStoragePath(`${ID}/cnic_front.jpg`), true);
  for (const bad of ['', `${ID}/../x.jpg`, `../${ID}/a.jpg`, '/etc/passwd', `${ID}/a/b.jpg`, 'x/y.jpg', `${ID}/a b.jpg`, `${ID}/a.jpg?x=1`, `http://evil/${ID}/a.jpg`]) {
    assert.equal(safeStoragePath(bad), false, bad);
  }
});
