import type { PublicKeyGetter } from './PublicKeyGetter';
import type { PublicKeyData } from './Types';
import { DidJwkPublicKeyGetter } from './impl/DidJwkPublicKeyGetter';
import { DidKeyPublicKeyGetter } from './impl/DidKeyPublicKeyGetter';
import { DidWebPublicKeyGetter } from './impl/DidWebPublicKeyGetter';
import { HttpsPublicKeyGetter } from './impl/HttpsPublicKeyGetter';

export class PublicKeyGetterFactory {
  async get(verificationMethod: string): Promise<PublicKeyData> {
    const vm = verificationMethod;
    let getter: PublicKeyGetter | null = null;
    if (vm.startsWith('did:web')) getter = new DidWebPublicKeyGetter();
    else if (vm.startsWith('did:key')) getter = new DidKeyPublicKeyGetter();
    else if (vm.startsWith('did:jwk')) getter = new DidJwkPublicKeyGetter();
    else if (vm.startsWith('http')) getter = new HttpsPublicKeyGetter();
    if (!getter) throw new Error('Public Key type is not supported');
    return getter.get(verificationMethod);
  }
}
