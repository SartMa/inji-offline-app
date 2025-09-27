import { VerificationResult } from '@mosip/react-inji-verify-sdk';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = '@offline-cache:verification-history';

type VerificationSource = 'scan' | 'image';

type PersistedVerification = Omit<StoredVerification, 'source'> & { source: 'scan' | 'upload' | 'image' };

type StoredVerification = {
  id: string;
  timestamp: number;
  source: VerificationSource;
  verificationStatus: boolean;
  verificationMessage?: string | null;
  verificationErrorCode?: string | null;
  payload?: any;
  raw?: string;
};

type VerificationHistoryContextValue = {
  history: StoredVerification[];
  addResult: (result: VerificationResult, extras: { source: VerificationSource; raw?: string }) => Promise<void>;
  clearHistory: () => Promise<void>;
};

const VerificationHistoryContext = createContext<VerificationHistoryContextValue | undefined>(undefined);

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `ver_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function persistHistory(history: StoredVerification[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.warn('[VerificationHistory] Failed to persist history', error);
  }
}

async function hydrateHistory(): Promise<StoredVerification[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as PersistedVerification[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((entry) => ({
      ...entry,
      source: entry.source === 'scan' ? 'scan' : 'image',
    }));
  } catch (error) {
    console.warn('[VerificationHistory] Failed to hydrate history', error);
    return [];
  }
}

export const VerificationHistoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [history, setHistory] = useState<StoredVerification[]>([]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const hydrated = await hydrateHistory();
      if (isMounted) {
        setHistory(hydrated);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const addResult = useCallback(async (result: VerificationResult, extras: { source: VerificationSource; raw?: string }) => {
    const entry: StoredVerification = {
      id: generateId(),
      timestamp: Date.now(),
      source: extras.source,
      verificationStatus: !!result.verificationStatus,
      verificationMessage: result.verificationMessage ?? null,
      verificationErrorCode: result.verificationErrorCode ?? null,
      payload: (result as any).payload ?? null,
      raw: extras.raw,
    };

    const updated = [entry, ...history].slice(0, 100);
    setHistory(updated);
    await persistHistory(updated);
  }, [history]);

  const clearHistory = useCallback(async () => {
    setHistory([]);
    await persistHistory([]);
  }, []);

  const value = useMemo(() => ({ history, addResult, clearHistory }), [history, addResult, clearHistory]);

  return (
    <VerificationHistoryContext.Provider value={value}>
      {children}
    </VerificationHistoryContext.Provider>
  );
};

export function useVerificationHistory(): VerificationHistoryContextValue {
  const ctx = useContext(VerificationHistoryContext);
  if (!ctx) {
    throw new Error('useVerificationHistory must be used within VerificationHistoryProvider');
  }
  return ctx;
}
