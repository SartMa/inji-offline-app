import { ValidationStatus } from '../data/data';

abstract class VerifiableCredential {
    abstract validate(credential: string): ValidationStatus;
    abstract verify(credential: string): Promise<boolean>;
}

export { VerifiableCredential };
