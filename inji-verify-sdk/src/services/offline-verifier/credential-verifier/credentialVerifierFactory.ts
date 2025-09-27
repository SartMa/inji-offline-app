import { CredentialFormat } from '../constants/CredentialFormat';
import { LdpVerifiableCredential } from './types/LdpVerifiableCredential';
import { MsoMdocVerifiableCredential } from './types/msomdoc/MsoMdocVerifiableCredential';
import { VerifiableCredential } from './verifiableCredential';

class CredentialVerifierFactory {
    get(credentialFormat: CredentialFormat): VerifiableCredential {
        switch (credentialFormat) {
            case CredentialFormat.LDP_VC:
                return new LdpVerifiableCredential();
            case CredentialFormat.MSO_MDOC:
                return new MsoMdocVerifiableCredential();
            default:
                throw new Error(`Unsupported credential format: ${credentialFormat}`);
        }
    }
}

export { CredentialVerifierFactory };
