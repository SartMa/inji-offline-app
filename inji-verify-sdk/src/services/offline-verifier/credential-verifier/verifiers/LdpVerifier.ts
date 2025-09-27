// External cryptographic libraries - The "Verification Engine"
import { Ed25519Signature2020 } from '@digitalbazaar/ed25519-signature-2020';
import { Ed25519VerificationKey2020 } from '@digitalbazaar/ed25519-verification-key-2020';
import * as ed25519 from '@noble/ed25519';
import * as jsigs from 'jsonld-signatures';

// Import SDK-internal utilities and exceptions
import { getContext } from '../../cache/utils/CacheHelper';
import { CredentialVerifierConstants } from '../../constants/CredentialVerifierConstants';
import { UnknownException } from '../../exception';
import { PublicKeyService } from '../../publicKey/PublicKeyService'; // This service should live inside the SDK
import { base64UrlDecode, decodeDidKeyMultibaseEd25519, hexToBytes, spkiToRawEd25519 } from '../../publicKey/Utils';
import { isExplicitlyOffline } from '../../utils/NetworkUtils';
import { OfflineDocumentLoader } from '../../utils/OfflineDocumentLoader'; // Your smart loader, also inside the SDK

/**
 * LDP (Linked Data Proof) Verifier
 *
 * PURPOSE: This class performs the CORE CRYPTOGRAPHIC verification of a credential's signature.
 * It is the forensic expert that validates the signature is genuine and the document is untampered.
 *
 * It relies on the industry-standard `jsonld-signatures` library to do the heavy lifting of
 * canonicalization and cryptographic checks, and uses our custom Document Loader to handle
 * offline-first context and key resolution.
 *
 * NOTE: This class no longer performs structural validation. It assumes it is being given
 * a structurally valid credential by an orchestrator (like a parent CredentialVerifier).
 */
export class LdpVerifier {
  // Development-only logger - suppresses ALL logs (info, warn, error, debug) in production
  private readonly logger = {
    info: (__DEV__ || process.env.NODE_ENV === 'development') ? console.info : () => {},
    warn: (__DEV__ || process.env.NODE_ENV === 'development') ? console.warn : () => {},
    error: (__DEV__ || process.env.NODE_ENV === 'development') ? console.error : () => {},
    debug: (__DEV__ || process.env.NODE_ENV === 'development') ? console.debug : () => {},
  };
  private readonly publicKeyService: PublicKeyService;

  constructor() {
    // The PublicKeyService is now an internal part of the SDK.
    // It will use the SDK's cache to resolve keys.
    this.publicKeyService = new PublicKeyService();
  }

  /**
   * MAIN CRYPTOGRAPHIC VERIFICATION METHOD
   *
   * This is the entry point for verifying the signature of a credential.
   *
   * @param credential - The Verifiable Credential as a JSON string.
   * @returns A Promise that resolves to `true` if all signatures are cryptographically valid, `false` otherwise.
   */
  async verify(credential: string): Promise<boolean> {
    try {
      this.logger.info('🔍 Starting credential verification process');

      const vcJsonLdObject = JSON.parse(credential);

      // OFFLINE PREFLIGHT: ensure all @context URLs are present in cache to surface a friendly error early
      if (isExplicitlyOffline()) {
        const rawCtx = vcJsonLdObject['@context'];
        const ctxList = Array.isArray(rawCtx) ? rawCtx : [rawCtx];
        const urlList = (ctxList || []).filter((c: any) => typeof c === 'string') as string[];
        for (const url of urlList) {
          const present = await getContext(url);
          if (!present) {
            throw new Error(CredentialVerifierConstants.ERROR_CODE_OFFLINE_DEPENDENCIES_MISSING);
          }
        }
      }

      // STEP 1: Extract the proof(s). A credential can have one or more signatures.
      const proof = vcJsonLdObject.proof;
      if (!proof) {
        this.logger.error("❌ Cryptographic verification failed: No 'proof' field found in the credential.");
        return false;
      }

      const proofs = Array.isArray(proof) ? proof : [proof];

      // STEP 2: Verify EACH proof. For a credential to be valid, ALL its signatures must be valid.
      for (const singleProof of proofs) {
        this.logger.info(`🔐 Verifying proof of type: ${singleProof.type}`);

        // We pass the full VC object and the specific proof to be verified.
        const isProofValid = await this.verifySingleProof(vcJsonLdObject, singleProof);

        if (!isProofValid) {
          this.logger.error(`❌ Proof verification FAILED for type: ${singleProof.type}. Credential is not valid.`);
          return false; // If any proof fails, the entire credential fails.
        }
      }

      this.logger.info("✅ All proofs verified successfully. Credential signature is valid!");
      return true;

    } catch (exception: any) {
      this.logger.error('💥 An unexpected error occurred during signature verification:', exception.message);
      const msg = (exception?.message ?? '').toString();
      if (msg.includes(CredentialVerifierConstants.ERROR_CODE_OFFLINE_DEPENDENCIES_MISSING)) {
        // Propagate offline-missing-deps so upper layer can map to friendly message
        throw exception;
      }
      // Wrap unknown errors for consistent error handling upstream.
      throw new UnknownException(`Error during cryptographic verification: ${exception.message}`);
    }
  }

  /**
   * Orchestrates the verification of a SINGLE proof by routing to the correct cryptographic suite.
   *
   * @param vcObject The full credential object.
   * @param proof The specific proof object from the credential to be verified.
   * @returns A promise resolving to `true` if the proof is valid.
   */
  private async verifySingleProof(vcObject: any, proof: any): Promise<boolean> {
    // Route to the appropriate verification method based on the signature type.
    // This structure makes it easy to add support for more signature types later.
    switch (proof.type) {
      case 'Ed25519Signature2020':
      case 'Ed25519Signature2018': // Handle as 2020 for compatibility
        return this.verifyWithSuite(vcObject, proof, Ed25519Signature2020, Ed25519VerificationKey2020);

      // --- PLACEHOLDERS FOR FUTURE SUPPORT ---
      // case 'RsaSignature2018':
      //   return this.verifyWithSuite(vcObject, proof, RsaSignature2018, RsaVerificationKey2018);
      // case 'EcdsaSecp256k1Signature2019':
      //   return this.verifyWithSuite(vcObject, proof, EcdsaSecp256k1Signature2019, EcdsaSecp256k1VerificationKey2019);

      default:
        this.logger.error(`❌ Unsupported signature type: ${proof.type}`);
        return false;
    }
  }

  /**
   * THE CORE VERIFICATION ENGINE
   *
   * This generic method uses the `jsonld-signatures` library to verify a proof
   * using a provided signature suite and key type.
   *
   * @param vcObject The full credential object.
   * @param proof The proof to verify.
   * @param Suite The signature suite class (e.g., Ed25519Signature2020).
   * @param VerificationKey The key class for the suite (e.g., Ed25519VerificationKey2020).
   * @returns A promise resolving to `true` if the signature is valid.
   */
  private async verifyWithSuite(vcObject: any, proof: any, Suite: any, VerificationKey: any): Promise<boolean> {
    try {
      const verificationMethodUrl = proof.verificationMethod;
      const publicKeyData = await this.publicKeyService.getPublicKey(verificationMethodUrl);
      if (!publicKeyData) {
        this.logger.error(`❌ Could not resolve public key for: ${verificationMethodUrl}`);
        if (isExplicitlyOffline()) {
          throw new Error(CredentialVerifierConstants.ERROR_CODE_OFFLINE_DEPENDENCIES_MISSING);
        }
        return false;
      }

      this.logger.debug?.('🔑 Resolved public key data:', publicKeyData);

      const controllerId = publicKeyData.controller ?? verificationMethodUrl.split('#')[0];
      const verificationMethodDoc: any = {
        id: verificationMethodUrl,
        type: publicKeyData.type ?? proof.type.replace('Signature', 'VerificationKey'),
        controller: controllerId,
      };

      if (publicKeyData.publicKeyMultibase) {
        verificationMethodDoc.publicKeyMultibase = publicKeyData.publicKeyMultibase;
      }
      if (publicKeyData.publicKeyJwk) {
        verificationMethodDoc.publicKeyJwk = publicKeyData.publicKeyJwk;
      }
      if (publicKeyData.publicKeyHex) {
        verificationMethodDoc.publicKeyHex = publicKeyData.publicKeyHex;
      }

      const keyPair = await VerificationKey.from(verificationMethodDoc);

      const suiteOptions: any = {
        key: keyPair,
        verificationMethod: verificationMethodDoc.id,
      };

      const cryptoSubtleAvailable = typeof globalThis.crypto?.subtle?.digest === 'function';
      if (!cryptoSubtleAvailable) {
        const fallbackVerifier = this.buildEd25519FallbackVerifier(publicKeyData, verificationMethodDoc.id);
        if (fallbackVerifier) {
          suiteOptions.verifier = fallbackVerifier;
          this.logger.warn('[Ed25519] Using noble-ed25519 fallback verifier because WebCrypto subtle API is unavailable.');
        } else {
          this.logger.warn('[Ed25519] crypto.subtle missing and no fallback verifier could be constructed. Verification may fail.');
        }
      }

      const suite = new Suite(suiteOptions);

      const controllerContexts = ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/v2'];
      if (proof.type && proof.type.toLowerCase().includes('ed25519') && !controllerContexts.includes('https://w3id.org/security/suites/ed25519-2020/v1')) {
        controllerContexts.push('https://w3id.org/security/suites/ed25519-2020/v1');
      }
      const controllerDoc: any = {
        '@context': controllerContexts,
        id: controllerId,
        verificationMethod: [verificationMethodDoc],
      };

      const purposeTerm = proof.proofPurpose || 'assertionMethod';
      controllerDoc[purposeTerm] = [verificationMethodDoc.id];

      const verificationResult = await jsigs.verify(
        { ...vcObject, proof },
        {
          suite,
          purpose: new jsigs.purposes.AssertionProofPurpose({ controller: controllerDoc }),
          documentLoader: OfflineDocumentLoader.getDocumentLoader(),
        }
      );

      if (verificationResult.verified) {
        this.logger.info(`✅ Signature verification successful for proof type ${proof.type}!`);
        return true;
      }

      const err = verificationResult.error as any;
      const collectMessages = (e: any): string[] => {
        if (!e) return [];
        const out: string[] = [];
        if (typeof e.message === 'string') out.push(e.message);
        if (Array.isArray(e.errors)) {
          for (const sub of e.errors) {
            out.push(...collectMessages(sub));
          }
        }
        if (Array.isArray(e.details)) {
          for (const sub of e.details) {
            out.push(...collectMessages(sub));
          }
        }
        return out;
      };
      const messages = collectMessages(err);
      const errMsg = messages.join(' | ');
      if (errMsg.includes(CredentialVerifierConstants.ERROR_CODE_OFFLINE_DEPENDENCIES_MISSING)) {
        throw new Error(CredentialVerifierConstants.ERROR_CODE_OFFLINE_DEPENDENCIES_MISSING);
      }
      this.logger.error(`❌ Signature verification failed for ${proof.type}:`, verificationResult.error);
      if (errMsg) {
        this.logger.error(`❌ ${proof.type} failure details: ${errMsg}`);
      }
      const verificationResults = (verificationResult as any)?.results;
      if (Array.isArray(verificationResults) && verificationResults.length) {
        this.logger.error('❌ Verification result breakdown:', JSON.stringify(verificationResults, null, 2));
      }
      return false;

    } catch (error: any) {
      this.logger.error(`💥 A critical error occurred during ${proof.type} verification:`, error.message);
      if (error?.message === CredentialVerifierConstants.ERROR_CODE_OFFLINE_DEPENDENCIES_MISSING) {
        throw error;
      }
      return false;
    }
  }

  private buildEd25519FallbackVerifier(publicKeyData: any, verificationMethodId: string): { id: string; verify: ({ data, signature }: { data: Uint8Array; signature: Uint8Array }) => Promise<boolean> } | null {
    try {
      const rawKey = this.extractEd25519RawKey(publicKeyData);
      if (!rawKey) {
        this.logger.warn('[Ed25519 fallback] Unable to derive raw public key for fallback verifier.');
        return null;
      }

      const immutableKey = new Uint8Array(rawKey);
      return {
        id: verificationMethodId,
        verify: async ({ data, signature }: { data: Uint8Array; signature: Uint8Array }) => {
          try {
            const verified = await ed25519.verify(signature, data, immutableKey);
            if (!verified) {
              this.logger.error('❌ [Ed25519 fallback] noble-ed25519 reported signature mismatch.');
            }
            return verified;
          } catch (error: any) {
            this.logger.error('💥 [Ed25519 fallback] Verification threw an error:', error?.message ?? error);
            return false;
          }
        }
      };
    } catch (error: any) {
      this.logger.warn('[Ed25519 fallback] Failed constructing fallback verifier:', error?.message ?? error);
      return null;
    }
  }

  private extractEd25519RawKey(publicKeyData: any): Uint8Array | null {
    try {
      if (publicKeyData?.publicKeyMultibase) {
        return decodeDidKeyMultibaseEd25519(publicKeyData.publicKeyMultibase);
      }

      const jwkX = publicKeyData?.publicKeyJwk?.x;
      if (jwkX) {
        return base64UrlDecode(jwkX);
      }

      if (typeof publicKeyData?.publicKeyHex === 'string') {
        const spkiBytes = hexToBytes(publicKeyData.publicKeyHex);
        return spkiToRawEd25519(spkiBytes);
      }
    } catch (error: any) {
      this.logger.warn('[Ed25519 fallback] Error extracting raw key material:', error?.message ?? error);
      return null;
    }

    this.logger.warn('[Ed25519 fallback] No supported key material found on public key data.');
    return null;
  }
}

