import { CONTEXT_STORE, KEY_STORE, REVOKED_VC_STORE } from '../constants/CacheConstants';
import { readJson, writeJson } from './AsyncStorageStore';

export type CachedPublicKey = {
  key_id: string;                 // e.g., did:web:...#key-0
  key_type?: string;              // e.g., Ed25519VerificationKey2020
  public_key_multibase?: string;  // z6M...
  public_key_hex?: string;        // optional
  public_key_jwk?: any;           // optional
  controller: string;             // DID without fragment
  purpose?: string;
  is_active?: boolean;
  organization_id?: string | null;
};

export type CachedRevokedVC = {
  vc_id: string;                  // Verifiable Credential ID
  issuer: string;                 // Issuer DID
  subject?: string;               // Subject DID (optional)
  reason?: string;                // Reason for revocation
  revoked_at: string;             // When it was revoked
  organization_id: string;        // Organization ID (required for proper scoping)
};

export type ContextRecord = {
  url: string;
  document: any;
  cachedAt: number;
  source?: string;
  organization_id?: string | null;
};

export type PublicKeyRecord = {
  key_id: string;
  key_type: string;
  public_key_multibase?: string;
  public_key_hex?: string;
  public_key_jwk?: any;
  controller: string;
  purpose: string;
  is_active: boolean;
  organization_id?: string | null;
};

export type RevokedVCRecord = CachedRevokedVC;

type ContextStoreState = Record<string, ContextRecord>;
type PublicKeyStoreState = Record<string, PublicKeyRecord>;
type RevokedVCStoreState = Record<string, RevokedVCRecord>;

const CONTEXT_STORAGE_KEY = `@inji-cache:${CONTEXT_STORE}`;
const PUBLIC_KEY_STORAGE_KEY = `@inji-cache:${KEY_STORE}`;
const REVOKED_VC_STORAGE_KEY = `@inji-cache:${REVOKED_VC_STORE}`;

async function loadContexts(): Promise<ContextStoreState> {
  return readJson<ContextStoreState>(CONTEXT_STORAGE_KEY, {});
}

async function saveContexts(store: ContextStoreState): Promise<void> {
  await writeJson(CONTEXT_STORAGE_KEY, store);
}

async function loadPublicKeys(): Promise<PublicKeyStoreState> {
  return readJson<PublicKeyStoreState>(PUBLIC_KEY_STORAGE_KEY, {});
}

async function savePublicKeys(store: PublicKeyStoreState): Promise<void> {
  await writeJson(PUBLIC_KEY_STORAGE_KEY, store);
}

async function loadRevokedVCs(): Promise<RevokedVCStoreState> {
  return readJson<RevokedVCStoreState>(REVOKED_VC_STORAGE_KEY, {});
}

async function saveRevokedVCs(store: RevokedVCStoreState): Promise<void> {
  await writeJson(REVOKED_VC_STORAGE_KEY, store);
}

export async function clearContextStore(): Promise<void> {
  await saveContexts({});
}

export async function clearPublicKeyStore(): Promise<void> {
  await savePublicKeys({});
}

export async function clearRevokedVCStore(): Promise<void> {
  await saveRevokedVCs({});
}

export async function clearAllCacheStores(): Promise<void> {
  await Promise.all([clearContextStore(), clearPublicKeyStore(), clearRevokedVCStore()]);
}

export async function putContexts(contexts: { url: string; document: any; organization_id?: string | null }[]): Promise<void> {
  if (!contexts?.length) return;
  const store = await loadContexts();
  const now = Date.now();
  for (const c of contexts) {
    if (!c.url) continue;
    store[c.url] = {
      url: c.url,
      document: c.document,
      cachedAt: now,
      source: 'prime',
      organization_id: c.organization_id ?? null,
    };
  }
  await saveContexts(store);
}

export async function replaceContextsForOrganization(organizationId: string, contexts: { url: string; document: any }[]): Promise<void> {
  const store = await loadContexts();
  let removed = 0;
  for (const url of Object.keys(store)) {
    if ((store[url].organization_id ?? null) === organizationId) {
      delete store[url];
      removed += 1;
    }
  }

  const now = Date.now();
  for (const ctx of contexts) {
    if (!ctx.url) continue;
    store[ctx.url] = {
      url: ctx.url,
      document: ctx.document,
      cachedAt: now,
      source: 'org-sync',
      organization_id: organizationId,
    };
  }

  await saveContexts(store);
  console.log(`[CacheHelper] Replaced ${removed} existing contexts with ${contexts.length} new contexts for organization ${organizationId}`);
}

export async function putPublicKeys(keys: CachedPublicKey[]): Promise<void> {
  if (!keys?.length) return;
  const store = await loadPublicKeys();
  for (const k of keys) {
    if (!k.key_id || !k.controller) throw new Error('putPublicKeys: key_id and controller are required');
    store[k.key_id] = {
      key_id: k.key_id,
      key_type: k.key_type ?? 'Ed25519VerificationKey2020',
      public_key_multibase: k.public_key_multibase,
      public_key_hex: k.public_key_hex,
      public_key_jwk: k.public_key_jwk,
      controller: k.controller.split('#')[0],
      purpose: k.purpose ?? 'assertion',
      is_active: k.is_active ?? true,
      organization_id: k.organization_id ?? null,
    };
  }
  await savePublicKeys(store);
}

// Lightweight reads used by the offline document loader
export async function getContext(url: string): Promise<any | null> {
  const store = await loadContexts();
  return store[url]?.document ?? null;
}

export async function getKeyById(keyId: string): Promise<any | null> {
  const store = await loadPublicKeys();
  return store[keyId] ?? null;
}

export async function getAnyKeyForDid(did: string): Promise<any | null> {
  const store = await loadPublicKeys();
  const values = Object.values(store);
  return values.find(record => record.controller === did) ?? null;
}

export type CachedContextInfo = Pick<ContextRecord, 'url' | 'cachedAt' | 'source' | 'organization_id'>;
export type CachedPublicKeyInfo = Pick<PublicKeyRecord, 'key_id' | 'key_type' | 'controller' | 'organization_id'> & {
  hasMultibase: boolean;
  hasHex: boolean;
  hasJwk: boolean;
};

export async function listCachedContexts(): Promise<CachedContextInfo[]> {
  const store = await loadContexts();
  return Object.values(store).map(({ url, cachedAt, source, organization_id }) => ({
    url,
    cachedAt,
    source,
    organization_id: organization_id ?? null,
  }));
}

export async function listCachedPublicKeys(): Promise<CachedPublicKeyInfo[]> {
  const store = await loadPublicKeys();
  return Object.values(store).map(({ key_id, key_type, controller, organization_id, public_key_multibase, public_key_hex, public_key_jwk }) => ({
    key_id,
    key_type,
    controller,
    organization_id: organization_id ?? null,
    hasMultibase: !!public_key_multibase,
    hasHex: !!public_key_hex,
    hasJwk: !!public_key_jwk,
  }));
}

export async function listCachedRevokedVCs(): Promise<RevokedVCRecord[]> {
  const store = await loadRevokedVCs();
  return Object.values(store);
}

export async function putRevokedVCs(revokedVCs: CachedRevokedVC[]): Promise<void> {
  if (!revokedVCs?.length) return;
  const store = await loadRevokedVCs();
  for (const vc of revokedVCs) {
    if (!vc.vc_id || !vc.issuer) throw new Error('putRevokedVCs: vc_id and issuer are required');
    store[vc.vc_id] = {
      vc_id: vc.vc_id,
      issuer: vc.issuer,
      subject: vc.subject ?? undefined,
      reason: vc.reason ?? undefined,
      revoked_at: vc.revoked_at,
      organization_id: vc.organization_id,
    };
  }
  await saveRevokedVCs(store);
}

export async function isVCRevoked(vcId: string): Promise<boolean> {
  const store = await loadRevokedVCs();
  return !!store[vcId];
}

export async function getRevokedVCInfo(vcId: string): Promise<CachedRevokedVC | null> {
  const store = await loadRevokedVCs();
  return store[vcId] ?? null;
}

export async function replaceRevokedVCsForOrganization(organizationId: string, revokedVCs: CachedRevokedVC[]): Promise<void> {
  const store = await loadRevokedVCs();
  let removed = 0;
  for (const key of Object.keys(store)) {
    if (store[key].organization_id === organizationId) {
      delete store[key];
      removed += 1;
    }
  }

  for (const revoked of revokedVCs) {
    store[revoked.vc_id] = {
      ...revoked,
      subject: revoked.subject ?? undefined,
      reason: revoked.reason ?? undefined,
    };
  }

  await saveRevokedVCs(store);
  console.log(`[CacheHelper] Replaced ${removed} existing revoked VCs with ${revokedVCs.length} new VCs for organization ${organizationId}`);
}

export async function replacePublicKeysForOrganization(organizationId: string, publicKeys: CachedPublicKey[]): Promise<void> {
  const store = await loadPublicKeys();
  let removed = 0;
  for (const key of Object.keys(store)) {
    if ((store[key].organization_id ?? null) === organizationId) {
      delete store[key];
      removed += 1;
    }
  }

  for (const publicKey of publicKeys) {
    if (!publicKey.key_id || !publicKey.controller) continue;
    store[publicKey.key_id] = {
      key_id: publicKey.key_id,
      key_type: publicKey.key_type ?? 'Ed25519VerificationKey2020',
      public_key_multibase: publicKey.public_key_multibase,
      public_key_hex: publicKey.public_key_hex,
      public_key_jwk: publicKey.public_key_jwk,
      controller: publicKey.controller.split('#')[0],
      purpose: publicKey.purpose ?? 'assertion',
      is_active: publicKey.is_active ?? true,
      organization_id: publicKey.organization_id ?? null,
    };
  }

  await savePublicKeys(store);
  console.log(`[CacheHelper] Replaced ${removed} existing public keys with ${publicKeys.length} new keys for organization ${organizationId}`);
}