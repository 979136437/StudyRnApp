import { describe, expect, it } from 'vitest';

import { nativeCompressor } from '../compressor.web';

describe('web compressor fallback', () => {
  it('reports native compression as unavailable', async () => {
    expect(() => nativeCompressor.createOperationId()).toThrow(
      '当前平台不支持原生媒体压缩',
    );
    await expect(
      nativeCompressor.getImageMetadata('a.jpg'),
    ).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    expect(nativeCompressor.cancel('missing')).toBe(false);
  });
});
