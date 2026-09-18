/**
 * Environment detection utilities.
 */

/**
 * Checks whether code is currently running in a browser runtime with a defined window object.
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Checks whether code is currently running in an automated test environment.
 */
export function isTestEnv(): boolean {
  return (
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') ||
    (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test')
  );
}
