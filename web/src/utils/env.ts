/**
 * Environment detection utilities.
 */

/**
 * Checks whether code is currently running in a browser runtime with a defined window object.
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}
