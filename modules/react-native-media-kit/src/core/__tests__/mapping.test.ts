import { describe, expect, it } from 'vitest';

import { mapPermission } from '../mapping';

describe('权限映射', () => {
  it('保留受限访问状态', () => {
    expect(
      mapPermission({
        status: 'granted',
        granted: true,
        canAskAgain: true,
        accessPrivileges: 'limited',
      }),
    ).toEqual({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      access: 'limited',
    });
  });

  it('兼容未提供访问级别的平台响应', () => {
    expect(
      mapPermission({ status: 'denied', granted: false, canAskAgain: false })
        .access,
    ).toBe('none');
  });
});
