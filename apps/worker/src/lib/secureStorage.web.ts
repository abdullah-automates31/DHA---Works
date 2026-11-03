import type { KeyValueStore } from './chunkedStorage';

// Browser build only (desktop preview): expo-secure-store has no web version, so the session goes in
// localStorage. Phones keep using secureStorage.ts (encrypted device storage). Falls back to memory when
// the browser blocks storage (private window), so sign-in still works for that tab.
const memory = new Map<string, string>();

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const secureStorage: KeyValueStore = {
  async getItem(key) {
    try {
      return local()?.getItem(key) ?? memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },
  async setItem(key, value) {
    memory.set(key, value);
    try {
      local()?.setItem(key, value);
    } catch {
      // storage full or blocked: the in-memory copy still works for this tab
    }
  },
  async removeItem(key) {
    memory.delete(key);
    try {
      local()?.removeItem(key);
    } catch {
      // nothing to do
    }
  },
};
