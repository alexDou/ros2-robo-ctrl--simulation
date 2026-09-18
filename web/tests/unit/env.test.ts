import { describe, it, expect } from 'vitest';
import { isBrowser, isTestEnv } from '@utils/env';

describe('isBrowser utility', () => {
  it('returns true when window is defined in browser/jsdom environment', () => {
    expect(isBrowser()).toBe(true);
  });

  it('returns false when window is undefined in node/server environment', () => {
    const originalWindow = globalThis.window;
    try {
      // @ts-expect-error intentionally simulating non-browser environment
      delete globalThis.window;
      expect(isBrowser()).toBe(false);
    } finally {
      globalThis.window = originalWindow;
    }
  });
});

describe('isTestEnv utility', () => {
  it('returns true when executing within vitest test runner', () => {
    expect(isTestEnv()).toBe(true);
  });
});
