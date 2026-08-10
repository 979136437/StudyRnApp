import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createHybridObject } = vi.hoisted(() => ({
  createHybridObject: vi.fn(() => ({
    getCameraPermissionsAsync: vi.fn(() => Promise.resolve({ granted: true })),
  })),
}));

vi.mock('react-native-nitro-modules', () => ({
  NitroModules: { createHybridObject },
}));

describe('native image picker initialization', () => {
  beforeEach(() => {
    vi.resetModules();
    createHybridObject.mockClear();
  });

  it('does not create the HybridObject until the first API call', async () => {
    const api = await import('../api/image-picker');
    expect(createHybridObject).not.toHaveBeenCalled();

    await api.getCameraPermissionsAsync();
    await api.getCameraPermissionsAsync();

    expect(createHybridObject).toHaveBeenCalledTimes(1);
    expect(createHybridObject).toHaveBeenCalledWith('ImagePicker');
  });
});
