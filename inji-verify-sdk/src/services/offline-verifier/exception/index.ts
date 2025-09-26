// === BASE EXCEPTION ===
export { BaseUncheckedException } from './BaseUncheckedException';

// === SPECIFIC EXCEPTIONS ===
export { ValidationException } from './ValidationException';
export { UnknownException } from './UnknownException';

// === TYPE EXPORTS (for TypeScript users) ===
export type { BaseUncheckedException as BaseUncheckedExceptionType } from './BaseUncheckedException';
export type { ValidationException as ValidationExceptionType } from './ValidationException';
export type { UnknownException as UnknownExceptionType } from './UnknownException';