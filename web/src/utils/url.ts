/**
 * URL Query Parameter Utilities.
 *
 * Enforces strict parameter extraction without silent default values.
 */

import { isBrowser } from '@utils/env';

/**
 * Extracts all query parameters from search string.
 *
 * @param search - Optional query string override (defaults to window.location.search).
 * @returns Key-value map of all present query parameters.
 */
export function getAllParams(search?: string): Record<string, string> {
  const searchStr =
    search !== undefined
      ? search
      : isBrowser()
      ? window.location.search
      : '';

  const params = new URLSearchParams(searchStr);
  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/**
 * Retrieves a required query parameter by key name.
 *
 * @param name - The required query parameter key.
 * @param search - Optional query string override (defaults to window.location.search).
 * @throws Error if the parameter is missing or empty.
 * @returns The string value of the parameter.
 */
export function getParam(name: string, search?: string): string {
  const searchStr =
    search !== undefined
      ? search
      : isBrowser()
      ? window.location.search
      : '';

  const params = new URLSearchParams(searchStr);
  const value = params.get(name);

  if (!value || value.trim() === '') {
    throw new Error(`Missing required URL query parameter: "${name}"`);
  }

  return value;
}
