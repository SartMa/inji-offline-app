// Lightweight storage adapter that prefers React Native AsyncStorage but gracefully
// falls back to an in-memory map when unavailable (e.g. during Jest or web builds).

// We intentionally avoid importing types from AsyncStorage at compile time to keep the
// SDK usable in non-RN environments. The dynamic require will be resolved only when the
// module is executed in a compatible runtime.

type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type MemoryStore = Map<string, string>;

const memoryStore: MemoryStore = new Map();

function createMemoryAdapter(): AsyncStorageLike {
  return {
    async getItem(key: string): Promise<string | null> {
      return memoryStore.has(key) ? memoryStore.get(key)! : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      memoryStore.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      memoryStore.delete(key);
    },
  };
}

function resolveStorage(): AsyncStorageLike {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const asyncStorage = require('@react-native-async-storage/async-storage').default;
    if (asyncStorage && typeof asyncStorage.getItem === 'function') {
      return asyncStorage as AsyncStorageLike;
    }
  } catch (e) {
    // Ignore and fall back to memory adapter
  }
  return createMemoryAdapter();
}

const storage = resolveStorage();

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn('[AsyncStorageStore] Failed to read key', key, error);
    return fallback;
  }
}

export async function writeJson<T>(key: string, value: T): Promise<void> {
  try {
    await storage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('[AsyncStorageStore] Failed to write key', key, error);
  }
}

export async function removeKey(key: string): Promise<void> {
  try {
    await storage.removeItem(key);
  } catch (error) {
    console.error('[AsyncStorageStore] Failed to remove key', key, error);
  }
}
