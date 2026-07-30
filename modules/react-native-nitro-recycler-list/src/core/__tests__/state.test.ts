import { describe, expect, it } from 'vitest';

import { EndReachedGate } from '../endReachedGate';
import { clearSavedOffset, readSavedOffset, saveOffset } from '../scrollState';

describe('EndReachedGate', () => {
  it('fires once per data version and supports retry', () => {
    const gate = new EndReachedGate();
    expect(gate.shouldFire('a', true)).toBe(true);
    expect(gate.shouldFire('a', true)).toBe(false);
    expect(gate.shouldFire('ab', true)).toBe(true);
    gate.retry();
    expect(gate.shouldFire('ab', true)).toBe(true);
  });

  it('does not consume a version while disabled', () => {
    const gate = new EndReachedGate();
    expect(gate.shouldFire('a', false)).toBe(false);
    expect(gate.shouldFire('a', true)).toBe(true);
  });
});

describe('nested scroll state', () => {
  it('stores non-negative offsets by list key', () => {
    saveOffset('carousel', 42);
    expect(readSavedOffset('carousel')).toBe(42);
    saveOffset('carousel', -10);
    expect(readSavedOffset('carousel')).toBe(0);
    clearSavedOffset('carousel');
    expect(readSavedOffset('carousel')).toBe(0);
  });
});
