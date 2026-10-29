// SecureStore rejects values over ~2 KB and a Supabase session is larger, so a value is split
// into numbered chunks. Pure over a small key/value interface so it can be unit tested.
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const CHUNK_SIZE = 1800;
const countKey = (key: string) => `${key}.chunks`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;

export function createChunkedStorage(store: KeyValueStore, chunkSize = CHUNK_SIZE): KeyValueStore {
  async function removeItem(key: string): Promise<void> {
    const raw = await store.getItem(countKey(key));
    const count = raw === null ? 0 : Number.parseInt(raw, 10);
    for (let i = 0; i < (Number.isFinite(count) ? count : 0); i++) {
      await store.removeItem(chunkKey(key, i));
    }
    await store.removeItem(countKey(key));
  }

  return {
    async getItem(key) {
      const raw = await store.getItem(countKey(key));
      if (raw === null) return null;
      const count = Number.parseInt(raw, 10);
      if (!Number.isFinite(count) || count < 1) return null;
      let value = '';
      for (let i = 0; i < count; i++) {
        const part = await store.getItem(chunkKey(key, i));
        if (part === null) return null; // a partial value is treated as no session
        value += part;
      }
      return value;
    },
    async setItem(key, value) {
      await removeItem(key);
      const count = Math.max(1, Math.ceil(value.length / chunkSize));
      for (let i = 0; i < count; i++) {
        await store.setItem(chunkKey(key, i), value.slice(i * chunkSize, (i + 1) * chunkSize));
      }
      await store.setItem(countKey(key), String(count));
    },
    removeItem,
  };
}
