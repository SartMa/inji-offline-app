import { CachedPublicKey, getKeyById, putPublicKeys } from '../cache/utils/CacheHelper';
import { canPerformNetworkRequest, isExplicitlyOffline } from '../utils/NetworkUtils';
import { PublicKeyGetterFactory } from './PublicKeyGetterFactory';
import { base64UrlDecode, bytesToHex, ed25519RawToMultibase, hexToBytes, parsePemToDer, spkiToRawEd25519 } from './Utils';

export class PublicKeyService {
  /**
   * Get public key from the SDK's IndexedDB cache ONLY.
   * This does not perform network-based DID resolution.
   */
  async getPublicKey(verificationMethod: string): Promise<any | null> {
    try {
      let record = await getKeyById(verificationMethod);

      const isIncomplete = (rec: any) => !rec?.public_key_multibase && !rec?.public_key_jwk && !rec?.public_key_hex;

      if (!record || isIncomplete(record)) {
        console.warn(`⚠️ Public key not found in cache: ${verificationMethod}`);
        // Online fallback: resolve and cache when a network request is possible
        if (canPerformNetworkRequest()) {
          try {
            const pk = await new PublicKeyGetterFactory().get(verificationMethod);
            const controller = verificationMethod.split('#')[0];
            let public_key_multibase: string | undefined;
            let public_key_jwk: any | undefined;
            let public_key_hex: string | undefined;

            // Prefer multibase for did:key
            if (controller.startsWith('did:key:')) {
              public_key_multibase = controller.split('did:key:')[1];
            }
            // If getter returned JWK or EC hex, capture it
            if ((pk as any).jwk) public_key_jwk = (pk as any).jwk;
            if ((pk as any).ecUncompressedHex) public_key_hex = (pk as any).ecUncompressedHex;
            // As a last resort, if bytes are present for EC keys, compute hex
            if (!public_key_hex && (pk as any).bytes && (pk as any).algorithm === 'secp256k1') {
              public_key_hex = bytesToHex((pk as any).bytes as Uint8Array);
            }

            // For Ed25519 keys (common with did:web), attempt to compute multibase from available material
            if (!public_key_multibase && (pk as any).algorithm === 'Ed25519') {
              // 1) If bytes (SPKI) available, derive raw32 and encode multibase
              if ((pk as any).bytes instanceof Uint8Array) {
                try {
                  const raw = spkiToRawEd25519((pk as any).bytes as Uint8Array);
                  public_key_multibase = ed25519RawToMultibase(raw);
                } catch { /* ignore, try other forms */ }
              }
              // 2) If PEM present, parse to DER -> raw32 -> multibase
              if (!public_key_multibase && (pk as any).pem) {
                try {
                  const der = parsePemToDer((pk as any).pem as string);
                  const raw = spkiToRawEd25519(der);
                  public_key_multibase = ed25519RawToMultibase(raw);
                } catch { /* ignore */ }
              }
              // 3) If JWK OKP Ed25519 present, derive multibase from x
              if (!public_key_multibase && public_key_jwk?.kty === 'OKP' && public_key_jwk?.crv === 'Ed25519' && public_key_jwk?.x) {
                try {
                  const raw = base64UrlDecode(public_key_jwk.x);
                  public_key_multibase = ed25519RawToMultibase(raw);
                } catch { /* ignore */ }
              }
            }

            await putPublicKeys([
              {
                key_id: verificationMethod,
                key_type: pk.keyType,
                controller,
                public_key_multibase,
                public_key_jwk,
                public_key_hex,
                is_active: true,
                purpose: 'assertion',
                organization_id: null
              } as CachedPublicKey
            ]);
            record = await getKeyById(verificationMethod);
          } catch (e: any) {
            console.error('💥 Error resolving public key online:', e);
            return null;
          }
        } else {
          if (isExplicitlyOffline()) {
            console.warn('⚠️ Skipping online key resolution because runtime reports offline mode.');
          }
          return null;
        }
      }
      if (!record) {
        console.warn(`⚠️ Public key unavailable after attempted resolution: ${verificationMethod}`);
        return null;
      }

      if (record.is_active === false) {
        console.warn(`⚠️ Public key is marked as inactive: ${verificationMethod}`);
        return null;
      }

      if (!record.public_key_multibase && (record.key_type ?? '').includes('Ed25519')) {
        const derivedMultibase = this.deriveEd25519Multibase(record);
        if (derivedMultibase) {
          record.public_key_multibase = derivedMultibase;
          try {
            await putPublicKeys([
              {
                key_id: record.key_id,
                key_type: record.key_type,
                controller: record.controller,
                public_key_multibase: derivedMultibase,
                public_key_jwk: record.public_key_jwk,
                public_key_hex: record.public_key_hex,
                is_active: record.is_active ?? true,
                purpose: record.purpose ?? 'assertion',
                organization_id: record.organization_id ?? null,
              } as CachedPublicKey,
            ]);
          } catch (persistError) {
            console.warn('⚠️ Failed to persist derived multibase key, continuing with in-memory value', persistError);
          }
        }
      }

      // Return the key in the format expected by the verifier
      return {
        id: record.key_id,
        type: record.key_type ?? 'Ed25519VerificationKey2020',
        controller: record.controller,
        publicKeyMultibase: record.public_key_multibase,
        publicKeyJwk: record.public_key_jwk,
        publicKeyHex: record.public_key_hex,
      };
    } catch (e) {
      console.error('💥 Error retrieving public key from cache:', e);
      return null;
    }
  }

  private deriveEd25519Multibase(record: any): string | undefined {
    try {
      if (record?.public_key_jwk?.kty === 'OKP' && record.public_key_jwk.crv === 'Ed25519' && record.public_key_jwk.x) {
        const raw = base64UrlDecode(record.public_key_jwk.x);
        return ed25519RawToMultibase(raw);
      }

      if (typeof record?.public_key_hex === 'string') {
        const bytes = hexToBytes(record.public_key_hex);
        const raw = spkiToRawEd25519(bytes);
        return ed25519RawToMultibase(raw);
      }
    } catch (error: any) {
      console.warn('⚠️ Unable to derive Ed25519 multibase key from cached material:', error?.message ?? error);
    }
    return undefined;
  }
}