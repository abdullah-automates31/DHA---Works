import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cancelHref, cashHref, jobHref, quoteHref, reportHref, statusHref } from './routes.ts';

const id = '11111111-1111-4111-8111-1111111111b1';

test('job links are plain paths', () => {
  assert.equal(jobHref(id), `/job/${id}`);
  assert.equal(quoteHref(id), `/job/${id}/quote`);
  assert.equal(statusHref(id), `/job/${id}/status`);
  assert.equal(cashHref(id), `/job/${id}/cash`);
  assert.equal(cancelHref(id), `/job/${id}/cancel`);
  assert.equal(reportHref(id), `/job/${id}/report`);
  assert.equal(reportHref(id, 'unsafe'), `/job/${id}/report?kind=unsafe`);
});

test('anything that is not an id falls back to the list and cannot inject a path', () => {
  for (const bad of ['', '../home', 'abc/def', 'x y', '1; drop table', '/job/1']) {
    for (const make of [jobHref, quoteHref, statusHref, cashHref, cancelHref, (x: string) => reportHref(x, 'unsafe')]) {
      assert.equal(make(bad), '/open-jobs', bad);
    }
  }
});
