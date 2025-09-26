import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import {
  OrgResolver,
  SDKCacheManager,
  CacheBundle,
} from '@mosip/react-inji-verify-sdk';

const STORAGE_KEY = '@offline-cache:credentials';

export type StoredCredential = {
  id: string;
  createdAt: number;
  issuer?: string;
  type?: string;
  summary?: string;
  raw: string;
};

type OfflineCacheContextValue = {
  entries: StoredCredential[];
  loading: boolean;
  addCredentialFromJson: (rawJson: string) => Promise<StoredCredential>;
  removeCredential: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
};

const OfflineCacheContext = createContext<OfflineCacheContextValue | undefined>(undefined);

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `cred_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function persistCredentials(entries: StoredCredential[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn('[OfflineCache] Failed to persist credentials', error);
  }
}

async function hydrateCredentials(): Promise<StoredCredential[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as StoredCredential[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (error) {
    console.warn('[OfflineCache] Failed to hydrate credentials', error);
    return [];
  }
}

export const OfflineCacheProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [entries, setEntries] = useState<StoredCredential[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const hydrated = await hydrateCredentials();
      if (isMounted) {
        setEntries(hydrated);
        setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const addCredentialFromJson = useCallback(async (rawJson: string) => {
    try {
      if (!rawJson?.trim()) {
        throw new Error('Credential JSON cannot be empty.');
      }

      const parsed = JSON.parse(rawJson);
      const bundle: CacheBundle = await OrgResolver.buildBundleFromVC(parsed, true);
      await SDKCacheManager.primeFromServer(bundle);

      const issuerRaw = parsed?.issuer;
      const issuer = typeof issuerRaw === 'string' ? issuerRaw : issuerRaw?.id;
      const type: string | undefined = Array.isArray(parsed?.type)
        ? parsed.type.find((t: string) => t !== 'VerifiableCredential') || parsed.type[0]
        : parsed?.type;

      const newEntry: StoredCredential = {
        id: generateId(),
        createdAt: Date.now(),
        issuer: issuer ?? undefined,
        type: type ?? undefined,
        summary: parsed?.credentialSubject?.fullName || parsed?.credentialSubject?.name,
        raw: JSON.stringify(parsed, null, 2),
      };

      const updated = [newEntry, ...entries];
      setEntries(updated);
      await persistCredentials(updated);

      Alert.alert('Credential cached for offline verification');
      return newEntry;
    } catch (error: any) {
      console.error('[OfflineCache] Failed to add credential', error);
      const message = error?.message ?? 'Unknown error adding credential';
      throw new Error(message);
    }
  }, [entries]);

  const removeCredential = useCallback(async (id: string) => {
    const updated = entries.filter(entry => entry.id !== id);
    setEntries(updated);
    await persistCredentials(updated);
  }, [entries]);

  const clearAll = useCallback(async () => {
    setEntries([]);
    await persistCredentials([]);
  }, []);

  const value = useMemo<OfflineCacheContextValue>(() => ({
    entries,
    loading,
    addCredentialFromJson,
    removeCredential,
    clearAll,
  }), [entries, loading, addCredentialFromJson, removeCredential, clearAll]);

  return (
    <OfflineCacheContext.Provider value={value}>
      {children}
    </OfflineCacheContext.Provider>
  );
};

export function useOfflineCache(): OfflineCacheContextValue {
  const ctx = useContext(OfflineCacheContext);
  if (!ctx) {
    throw new Error('useOfflineCache must be used within OfflineCacheProvider');
  }
  return ctx;
}
