import { CredentialFormat } from '../constants/CredentialFormat';
import { LdpVerifiableCredential } from './types/LdpVerifiableCredential';
import { VerifiableCredential } from './verifiableCredential';

class CredentialVerifierFactory {
    get(credentialFormat: CredentialFormat): VerifiableCredential {
        switch (credentialFormat) {
            case CredentialFormat.LDP_VC:
                return new LdpVerifiableCredential();
            default:
                throw new Error(`Unsupported credential format on React Native: ${credentialFormat}`);
        }
    }
}

export { CredentialVerifierFactory };
