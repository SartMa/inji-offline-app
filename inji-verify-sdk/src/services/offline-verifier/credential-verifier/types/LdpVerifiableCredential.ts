import { VerifiableCredential } from '../verifiableCredential';
import { LdpValidator } from '../validators/LdpValidator';
import { LdpVerifier } from '../verifiers/LdpVerifier';
import { ValidationStatus } from '../../data/data';

class LdpVerifiableCredential extends VerifiableCredential {
    validate(credential: string): ValidationStatus {
        return new LdpValidator().validate(credential);
    }

    async verify(credential: string): Promise<boolean> {
        return await new LdpVerifier().verify(credential);
    }
}

export { LdpVerifiableCredential };