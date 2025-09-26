import 'react-native-get-random-values';
import { getRandomBytes } from 'expo-crypto';

// Provide a minimal global crypto polyfill for libraries that expect Web Crypto APIs
// such as jsonld-signatures. These utilities primarily rely on crypto.getRandomValues.

type TypedArray = Uint8Array | Uint16Array | Uint32Array;

const globalScope = globalThis as unknown as { crypto?: { getRandomValues?: (array: TypedArray) => TypedArray } };

if (typeof globalScope.crypto === 'undefined') {
  globalScope.crypto = {};
}

if (typeof globalScope.crypto.getRandomValues !== 'function') {
  globalScope.crypto.getRandomValues = (typedArray: TypedArray): TypedArray => {
    if (!(typedArray instanceof Uint8Array || typedArray instanceof Uint16Array || typedArray instanceof Uint32Array)) {
      throw new TypeError('Expected Uint8Array, Uint16Array, or Uint32Array');
    }

    const byteLength = typedArray.byteLength;
    const randomBytes = getRandomBytes(byteLength);
    const view = new Uint8Array(typedArray.buffer, typedArray.byteOffset, byteLength);
    view.set(randomBytes);
    return typedArray;
  };
}
