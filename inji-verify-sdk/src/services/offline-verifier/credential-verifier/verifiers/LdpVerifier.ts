// // Import our custom validation logic and exceptions
// import { CredentialValidatorConstants } from '../../constants/CredentialValidatorConstants.js';
// import { ValidationException, UnknownException } from '../../exception/index.js';
// import { LdpValidator } from '../validators/LdpValidator.js';
// // Add this import after your existing imports
// import { OfflineDocumentLoader } from '../../utils/OfflineDocumentLoader.js';
// // External cryptographic libraries for digital signature verification
// import * as jsigs from 'jsonld-signatures';              // Main library for JSON-LD signature verification
// import { Ed25519Signature2020 } from '@digitalbazaar/ed25519-signature-2020';  // Ed25519 signature algorithm

// import { Ed25519VerificationKey2020 } from '@digitalbazaar/ed25519-verification-key-2020';  // Ed25519 key handling
// import { PublicKeyService } from '../../publicKey/PublicKeyService.js';
// /**
//  * LDP (Linked Data Proof) Verifier
//  * 
//  * PURPOSE: This class verifies the cryptographic signatures on Verifiable Credentials
//  * that use Linked Data Proofs (LDP) format. Think of it like verifying a digital
//  * signature on a document to ensure it hasn't been tampered with and was signed
//  * by the claimed issuer.
//  * 
//  * WHAT IT DOES:
//  * 1. Takes a Verifiable Credential (VC) as JSON string
//  * 2. Validates the structure and format
//  * 3. Extracts the cryptographic proof/signature
//  * 4. Verifies the signature using the issuer's public key
//  * 5. Returns true if valid, false if invalid
//  * 
//  * ANALOGY: Like checking if a signed contract is genuine by:
//  * - Checking the document format is correct
//  * - Finding the signature
//  * - Using the signer's public key to verify the signature
//  */
// export class LdpVerifier {
//   private readonly logger = console;                     // For debugging and error tracking
//   private readonly validator: LdpValidator;              // Validates credential structure
//   private readonly publicKeyService: PublicKeyService;

//   // Maps signature algorithm names to their implementation classes
//   // This tells us which cryptographic method to use for each signature type
//   private readonly SIGNATURE_SUITES = new Map([
//     ['Ed25519Signature2020', Ed25519Signature2020],     // Modern, secure signature algorithm
//     ['Ed25519Signature2018', Ed25519Signature2020],     // Older version, backward compatibility
//     // Future: Add RSA, ECDSA when packages are available
//   ]);

//   constructor() {
//     this.validator = new LdpValidator();                 // Initialize structure validator
//     this.publicKeyService = new PublicKeyService();
//   }

//   /**
//    * MAIN VERIFICATION METHOD
//    * 
//    * This is the entry point that external code calls to verify a credential.
//    * It orchestrates the entire verification process.
//    * 
//    * @param credential - The Verifiable Credential as a JSON string
//    * @returns Promise<boolean> - true if signature is valid, false otherwise
//    * 
//    * PROCESS FLOW:
//    * 1. Parse JSON credential
//    * 2. Validate structure (required fields, format)
//    * 3. Extract proof(s) from credential
//    * 4. Verify each proof cryptographically
//    * 5. Return result
//    */
//   async verify(credential: string): Promise<boolean> {
//     try {
//       this.logger.info("🔍 Starting credential verification process");

//       // STEP 1: Parse the JSON credential string into an object
//       // This converts the string into a JavaScript object we can work with
//       const vcJsonLdObject = JSON.parse(credential);

//       // STEP 2: Validate the credential structure using LdpValidator
//       // This checks if all required fields are present and properly formatted
//       // (like @context, type, issuer, credentialSubject, etc.)
//       const validationResult = this.validator.validate(credential);
      
//       // If structure validation failed (except for expiration), return false
//       if (validationResult.validationMessage && 
//           validationResult.validationErrorCode !== CredentialValidatorConstants.ERROR_CODE_VC_EXPIRED) {
//         this.logger.error("❌ Credential structure validation failed:", validationResult.validationMessage);
//         return false;
//       }

//       // STEP 3: Extract the cryptographic proof from the credential
//       // The 'proof' field contains the digital signature and metadata needed for verification
//       const ldProof = vcJsonLdObject.proof;
//       if (!ldProof) {
//         this.logger.error("❌ No cryptographic proof found in credential");
//         return false;
//       }

//       // STEP 4: Handle multiple proofs (a credential can have multiple signatures)
//       // Convert single proof to array for uniform processing
//       const proofs = Array.isArray(ldProof) ? ldProof : [ldProof];
      
//       // STEP 5: Verify each proof - ALL must be valid for credential to be valid
//       for (const proof of proofs) {
//         this.logger.info(`🔐 Verifying proof of type: ${proof.type}`);
//         const isProofValid = await this.verifyProof(vcJsonLdObject, proof);
//         if (!isProofValid) {
//           this.logger.error(`❌ Proof verification failed for type: ${proof.type}`);
//           return false;
//         }
//       }

//       this.logger.info("✅ All proofs verified successfully - credential is valid!");
//       return true;

//     } catch (exception: any) {
//       this.logger.error('💥 Unexpected error during verification:', exception.message);
      
//       // Re-throw known exceptions, wrap unknown ones
//       if (exception instanceof ValidationException) {
//         throw exception;
//       }
//       throw new UnknownException("Error while doing verification of verifiable credential");
//     }
//   }

//   /**
//    * PROOF VERIFICATION ORCHESTRATOR
//    * 
//    * This method handles the verification of a single cryptographic proof.
//    * Different signature types require different verification algorithms.
//    * 
//    * @param vcObject - The credential object (without proof for signature verification)
//    * @param proof - The specific proof to verify
//    * @returns Promise<boolean> - true if this specific proof is valid
//    * 
//    * WHAT HAPPENS HERE:
//    * 1. Remove proof from credential (needed for signature verification)
//    * 2. Determine which signature algorithm was used
//    * 3. Call the appropriate verification method
//    */
//   private async verifyProof(vcObject: any, proof: any): Promise<boolean> {
//     try {
//       // Create a copy of the credential WITHOUT the proof
//       // This is necessary because the signature was created over the credential
//       // content WITHOUT the signature itself (obviously!)
//       const vcCopy = { ...vcObject };
//       delete vcCopy.proof;

//       // Route to the appropriate verification method based on signature type
//       // Each signature algorithm has different verification requirements
//       if (proof.type === 'Ed25519Signature2020' || proof.type === 'Ed25519Signature2018') {
//         return await this.verifyEd25519Proof(vcCopy, proof);
//       } else if (proof.type === 'RsaSignature2018') {
//         return await this.verifyRsaProof(vcCopy, proof);
//       } else if (proof.type === 'EcdsaSecp256k1Signature2019') {
//         return await this.verifyEcdsaProof(vcCopy, proof);
//       } else {
//         this.logger.error(`❌ Unsupported signature type: ${proof.type}`);
//         return false;
//       }

//     } catch (error: any) {
//       this.logger.error('💥 Error during proof verification:', error.message);
//       return false;
//     }
//   }

//   /**
//    * ED25519 SIGNATURE VERIFICATION
//    * 
//    * Ed25519 is a modern, secure elliptic curve signature algorithm.
//    * It's fast, secure, and produces small signatures.
//    * 
//    * @param vcObject - Credential content (without proof)
//    * @param proof - Ed25519 proof object containing signature and metadata
//    * @returns Promise<boolean> - true if Ed25519 signature is valid
//    * 
//    * VERIFICATION PROCESS:
//    * 1. Get the public key from the verification method
//    * 2. Create an Ed25519 key pair object
//    * 3. Set up the signature suite
//    * 4. Use jsonld-signatures to verify (handles canonicalization + crypto)
//    */
//   private async verifyEd25519Proof(vcObject: any, proof: any): Promise<boolean> {
//     try {
//       console.log('🔐 [Ed25519] Starting signature verification');
//       console.log('📝 [Ed25519] Proof:', JSON.stringify(proof, null, 2));

//       // 1) Resolve public key from local cache
//       const publicKey = await this.getPublicKey(proof.verificationMethod);
//       if (!publicKey) {
//         this.logger.error(`❌ Could not resolve public key for: ${proof.verificationMethod}`);
//         return false;
//       }
//       console.log('🔑 [Ed25519] Public key info:', JSON.stringify(publicKey, null, 2));

//       // 2) Build minimal controller + VM docs for offline purpose authorization
//       const controllerDid = publicKey.controller || proof.verificationMethod.split('#')[0];

//       const verificationMethodDoc = {
//         id: proof.verificationMethod,
//         type: 'Ed25519VerificationKey2020',
//         controller: controllerDid,
//         publicKeyMultibase: publicKey.publicKeyMultibase
//       };

//       const controllerDoc = {
//         '@context': [
//           'https://www.w3.org/ns/did/v1',
//           'https://w3id.org/security/suites/ed25519-2020/v1'
//         ],
//         id: controllerDid,
//         verificationMethod: [verificationMethodDoc],
//         assertionMethod: [verificationMethodDoc.id]
//       };

//       // 3) Create suite
//       const keyPair = await Ed25519VerificationKey2020.from(verificationMethodDoc);
//       const suite = new Ed25519Signature2020({
//         key: keyPair,
//         verificationMethod: verificationMethodDoc.id
//       });

//       console.log('🔒 [Ed25519] Starting jsigs.verify...');
//       const verificationResult = await jsigs.verify(
//         { ...vcObject, proof },
//         {
//           suite,
//           // Supply controller so purpose check passes offline
//           purpose: new jsigs.purposes.AssertionProofPurpose({ controller: controllerDoc }),
//           documentLoader: this.getConfigurableDocumentLoader()
//         }
//       );

//       console.log('✅ [Ed25519] Verification result:', verificationResult);
//       console.log('✅ [Ed25519] Verification verified:', verificationResult.verified);

//       if (verificationResult.verified) {
//         this.logger.info("✅ Ed25519 signature verification successful!");
//         return true;
//       } else {
//         const detail = verificationResult.error?.message || 'Unknown error';
//         // console.error('❌ [Ed25519] Detailed verification failures:', verificationResult.);
//         this.logger.error('❌ Ed25519 signature verification failed:', detail || verificationResult.error || 'Unknown error');
//         return false;
//       }
//     } catch (error: any) {
//       this.logger.error('💥 Ed25519 verification error:', error.message);
//       return false;
//     }
//   }

//   /**
//    * RSA SIGNATURE VERIFICATION (Placeholder)
//    * 
//    * RSA is an older but widely-used signature algorithm.
//    * Currently not implemented due to missing packages.
//    */
//   private async verifyRsaProof(vcObject: any, proof: any): Promise<boolean> {
//     this.logger.warn('⚠️ RSA signature verification not implemented - missing package');
//     // TODO: Implement when @digitalbazaar/rsa-signature-2018 is available
//     return false;
//   }

//   /**
//    * ECDSA SIGNATURE VERIFICATION (Placeholder)
//    * 
//    * ECDSA with secp256k1 curve (same as Bitcoin) signature algorithm.
//    * Currently not implemented due to missing packages.
//    */
//   private async verifyEcdsaProof(vcObject: any, proof: any): Promise<boolean> {
//     this.logger.warn('⚠️ ECDSA secp256k1 signature verification not implemented - missing package');
//     // TODO: Implement when @digitalbazaar/ecdsa-secp256k1-signature-2019 is available
//     return false;
//   }

//   /**
//    * PUBLIC KEY RESOLUTION
//    * 
//    * This is the CRITICAL method that needs proper implementation for production.
//    * It takes a verification method ID and returns the corresponding public key.
//    * 
//    * @param verificationMethod - A URI that identifies a public key
//    * @returns Promise<any> - Public key object or null if not found
//    * 
//    * CURRENT STATUS: Returns mock data for testing
//    * PRODUCTION NEEDED: Implement actual key resolution logic
//    * 
//    * VERIFICATION METHOD EXAMPLES:
//    * - "did:web:issuer.com#key-1"  -> Resolve via DID document
//    * - "https://issuer.com/keys/1" -> HTTP GET request
//    * - "did:key:z6Mk..."          -> Extract key from the DID itself
//    */
//   private async getPublicKey(verificationMethod: string): Promise<any> {
//     this.logger.info(`🔑 Resolving public key from cache for: ${verificationMethod}`);
//     return this.publicKeyService.getPublicKey(verificationMethod);
//   }

//   /**
//    * DOCUMENT LOADER - JSON-LD CONTEXT RESOLUTION
//    * 
//    * PURPOSE: Resolves @context URLs in JSON-LD documents
//    * 
//    * WHAT IS @context?
//    * JSON-LD uses @context to define what terms mean. For example:
//    * "@context": "https://www.w3.org/2018/credentials/v1"
//    * This URL contains definitions like: "issuer" means "https://www.w3.org/2018/credentials#issuer"
//    * 
//    * NETWORK CALLS: Yes, potentially makes HTTP requests to fetch context definitions
//    * OPTIMIZATION: We cache common contexts locally to avoid network calls
//    * 
//    * @returns Function that resolves context URLs to their definitions
//    */
// /**
//  * DOCUMENT LOADER - OFFLINE JSON-LD CONTEXT RESOLUTION
//  * 
//  * Uses OfflineDocumentLoader utility to resolve @context URLs from local cache.
//  * No network calls are made during verification - everything is offline.
//  */
//   private getConfigurableDocumentLoader(): any {
//     return OfflineDocumentLoader.getDocumentLoader();
//   }
// }




// External cryptographic libraries - The "Verification Engine"
import * as jsigs from 'jsonld-signatures';
import { Ed25519Signature2020 } from '@digitalbazaar/ed25519-signature-2020';
import { Ed25519VerificationKey2020 } from '@digitalbazaar/ed25519-verification-key-2020';
import * as ed25519 from '@noble/ed25519';

// Import SDK-internal utilities and exceptions
import { UnknownException } from '../../exception';
import { CredentialVerifierConstants } from '../../constants/CredentialVerifierConstants';
import { PublicKeyService } from '../../publicKey/PublicKeyService'; // This service should live inside the SDK
import { OfflineDocumentLoader } from '../../utils/OfflineDocumentLoader'; // Your smart loader, also inside the SDK
import { getContext } from '../../cache/utils/CacheHelper';
import { base64UrlDecode, hexToBytes, spkiToRawEd25519, decodeDidKeyMultibaseEd25519 } from '../../publicKey/Utils';

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
  private readonly logger = console;
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
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
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
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
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

