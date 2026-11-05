import assert from 'node:assert/strict';
import { test } from 'node:test';

import { stableCacheKey, stableSource } from './image.ts';

const BASE = 'https://x.supabase.co/storage/v1/object/sign/job-media/job1/photo-1.jpg';

test('two signings of the same file share one cache key', () => {
  assert.equal(stableCacheKey(`${BASE}?token=aaa`), stableCacheKey(`${BASE}?token=bbb`));
  assert.equal(stableCacheKey(`${BASE}?token=aaa`), BASE);
});

test('different files never share a cache key', () => {
  const other = BASE.replace('photo-1', 'photo-2');
  assert.notEqual(stableCacheKey(`${BASE}?token=aaa`), stableCacheKey(`${other}?token=aaa`));
});

test('a url without a query string is its own key', () => {
  assert.equal(stableCacheKey(BASE), BASE);
});

test('stableSource keeps the real url for downloading and adds the key', () => {
  assert.deepEqual(stableSource(`${BASE}?token=aaa`), { uri: `${BASE}?token=aaa`, cacheKey: BASE });
});
