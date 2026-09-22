import type * as THREE from 'three';

function isDisposable(value: unknown): value is { dispose: () => void } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'dispose' in value &&
    typeof (value as { dispose: unknown }).dispose === 'function'
  );
}

export function disposeMaterial(mat: THREE.Material): void {
  if (!mat) return;
  mat.dispose();
  for (const value of Object.values(mat)) {
    if (isDisposable(value)) {
      value.dispose();
    }
  }
}
