/**
 * Utility helpers for determining network availability in environments where
 * the traditional `navigator.onLine` signal may be absent (e.g. React Native).
 *
 * We treat the runtime as "explicitly offline" only when a boolean onLine flag
 * exists and is false. When the flag is missing we optimistically assume that
 * network requests are allowed and let fetch decide.
 */
export function isExplicitlyOffline(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const nav = navigator as Navigator & { onLine?: boolean };
  return typeof nav.onLine === 'boolean' && nav.onLine === false;
}

/**
 * Returns true when the runtime exposes a fetch implementation and we are not
 * explicitly offline. This is a conservative check that still allows network
 * attempts in environments where navigator.onLine is undefined (React Native).
 */
export function canPerformNetworkRequest(): boolean {
  if (typeof fetch !== 'function') {
    return false;
  }
  if (typeof navigator === 'undefined') {
    return true;
  }
  const nav = navigator as Navigator & { onLine?: boolean };
  if (typeof nav.onLine === 'boolean') {
    return nav.onLine !== false;
  }
  return true;
}
