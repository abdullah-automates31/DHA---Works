import assert from 'node:assert/strict';
import { test } from 'node:test';

import { jobHref, quoteHref } from './routes.ts';

const id = '11111111-1111-4111-8111-1111111111b1';

test('job links are plain paths', () => {
  assert.equal(jobHref(id), `/job/${id}`);
  assert.equal(quoteHref(id), `/job/${id}/quote`);
});

test('anything that is not an id falls back to the list and cannot inject a path', () => {
  for (const bad of ['', '../home', 'abc/def', 'x y', "1; drop table", '/job/1']) {
    assert.equal(jobHref(bad), '/open-jobs', bad);
    assert.equal(quoteHref(bad), '/open-jobs', bad);
  }
});
