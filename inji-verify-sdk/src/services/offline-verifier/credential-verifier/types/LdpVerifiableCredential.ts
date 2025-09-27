import { ValidationStatus } from '../../data/data';
import { LdpValidator } from '../validators/LdpValidator';
import { VerifiableCredential } from '../verifiableCredential';
import { LdpVerifier } from '../verifiers/LdpVerifier';

class LdpVerifiableCredential extends VerifiableCredential {
    validate(credential: string): ValidationStatus {
        return new LdpValidator().validate(credential);
    }

    async verify(credential: string): Promise<boolean> {
        return await new LdpVerifier().verify(credential);
    }
}

export { LdpVerifiableCredential };
