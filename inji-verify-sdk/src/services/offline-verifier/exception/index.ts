// === BASE EXCEPTION ===
export { BaseUncheckedException } from './BaseUncheckedException';

// === SPECIFIC EXCEPTIONS ===
export { UnknownException } from './UnknownException';
export { ValidationException } from './ValidationException';

// === TYPE EXPORTS (for TypeScript users) ===
export type { BaseUncheckedException as BaseUncheckedExceptionType } from './BaseUncheckedException';
export type { UnknownException as UnknownExceptionType } from './UnknownException';
export type { ValidationException as ValidationExceptionType } from './ValidationException';
