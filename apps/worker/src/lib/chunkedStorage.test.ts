import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createChunkedStorage, type KeyValueStore } from './chunkedStorage.ts';

function memoryStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => void map.set(k, v),
    removeItem: async (k) => void map.delete(k),
  };
}

test('round-trips a value larger than one chunk', async () => {
  const mem = memoryStore();
  const storage = createChunkedStorage(mem, 10);
  const value = 'x'.repeat(95) + 'END';
  await storage.setItem('session', value);
  assert.equal(await storage.getItem('session'), value);
  assert.ok([...mem.map.entries()].filter(([k]) => !k.endsWith('.chunks')).every(([, v]) => v.length <= 10));
});

test('returns null when nothing is stored', async () => {
  assert.equal(await createChunkedStorage(memoryStore()).getItem('nope'), null);
});

test('overwriting with a shorter value leaves no stale chunks', async () => {
  const mem = memoryStore();
  const storage = createChunkedStorage(mem, 4);
  await storage.setItem('k', 'a'.repeat(20));
  await storage.setItem('k', 'bb');
  assert.equal(await storage.getItem('k'), 'bb');
  assert.deepEqual([...mem.map.keys()].sort(), ['k.0', 'k.chunks']);
});

test('removeItem deletes every chunk', async () => {
  const mem = memoryStore();
  const storage = createChunkedStorage(mem, 4);
  await storage.setItem('k', 'abcdefghij');
  await storage.removeItem('k');
  assert.equal(mem.map.size, 0);
  assert.equal(await storage.getItem('k'), null);
});

test('a missing chunk is treated as no session', async () => {
  const mem = memoryStore();
  const storage = createChunkedStorage(mem, 4);
  await storage.setItem('k', 'abcdefghij');
  mem.map.delete('k.1');
  assert.equal(await storage.getItem('k'), null);
});

test('an empty string round-trips', async () => {
  const storage = createChunkedStorage(memoryStore(), 4);
  await storage.setItem('k', '');
  assert.equal(await storage.getItem('k'), '');
});
