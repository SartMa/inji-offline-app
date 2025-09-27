import { sha256 } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';
import { getRandomBytes } from 'expo-crypto';
import { polyfillWebCrypto } from 'expo-standard-web-crypto';
import 'react-native-get-random-values';

type TypedArray = Uint8Array | Uint16Array | Uint32Array;

type GlobalCrypto = typeof globalThis & {
  crypto?: Crypto & { getRandomValues?: (array: TypedArray) => TypedArray };
};

polyfillWebCrypto();

const globalScope = globalThis as GlobalCrypto;

if (typeof globalScope.crypto === 'undefined') {
  globalScope.crypto = {} as Crypto;
}

if (!globalScope.crypto.subtle) {
  // Only warn in development mode to reduce production console noise
  if (__DEV__) {
    console.warn('[polyfills/ensureCrypto] WebCrypto subtle API is unavailable even after polyfill. Applying digest-only fallback.');
  }

  const ensureUint8Array = (data: ArrayBufferView | ArrayBuffer): Uint8Array => {
    if (data instanceof Uint8Array) {
      return data;
    }

    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }

    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }

    throw new TypeError('Data supplied to subtle.digest must be an ArrayBuffer or ArrayBufferView');
  };

  const toArrayBuffer = (data: Uint8Array): ArrayBuffer => {
    const out = new Uint8Array(data.byteLength);
    out.set(data);
    return out.buffer;
  };

  const digest: SubtleCrypto['digest'] = async (algorithm, data) => {
    const algoName = typeof algorithm === 'string' ? algorithm : algorithm?.name;
    if (!algoName) {
      throw new TypeError('Algorithm name required for subtle.digest');
    }

    const normalized = algoName.toUpperCase();
    const input = ensureUint8Array(data);

    switch (normalized) {
      case 'SHA-256':
        return toArrayBuffer(sha256(input));
      case 'SHA-512':
        return toArrayBuffer(sha512(input));
      default:
        throw new Error(`subtle.digest fallback only supports SHA-256 and SHA-512. Requested: ${algoName}`);
    }
  };

  (globalScope.crypto as Crypto & { subtle?: SubtleCrypto }).subtle = { digest } as SubtleCrypto;
}

if (typeof globalScope.crypto.getRandomValues !== 'function') {
  const fallback = (typedArray: TypedArray): TypedArray => {
    if (!(typedArray instanceof Uint8Array || typedArray instanceof Uint16Array || typedArray instanceof Uint32Array)) {
      throw new TypeError('Expected Uint8Array, Uint16Array, or Uint32Array');
    }

    const byteLength = typedArray.byteLength;
    const randomBytes = getRandomBytes(byteLength);
    const view = new Uint8Array(typedArray.buffer, typedArray.byteOffset, byteLength);
    view.set(randomBytes);
    return typedArray;
  };

  globalScope.crypto.getRandomValues = fallback as Crypto['getRandomValues'];
}
