import { describe, expect, it } from 'vitest';

import {
  resolveVisibilityPlaybackCommand,
  type VisibilityPlaybackContext,
} from '../visibility-playback';

const DEFAULT_CONTEXT: VisibilityPlaybackContext = {
  autoplayPending: true,
  pause: false,
  playing: false,
  resumeWhenAllowed: false,
  visibilityEnabled: true,
  visibilityMeasured: true,
  visible: true,
};

function command(
  overrides: Partial<VisibilityPlaybackContext> = {},
): ReturnType<typeof resolveVisibilityPlaybackCommand> {
  return resolveVisibilityPlaybackCommand({
    ...DEFAULT_CONTEXT,
    ...overrides,
  });
}

describe('resolveVisibilityPlaybackCommand', () => {
  it('首次可见测量前不启动自动播放', () => {
    expect(command({ visibilityMeasured: false })).toBe('none');
  });

  it('可见时启动自动播放', () => {
    expect(command()).toBe('play');
  });

  it('视频离开可视范围后立即暂停', () => {
    expect(command({ playing: true, visible: false })).toBe('pause');
  });

  it('重新可见时恢复离开前的播放状态', () => {
    expect(command({ autoplayPending: false, resumeWhenAllowed: true })).toBe(
      'play',
    );
  });

  it('用户原本手动暂停时不自动恢复', () => {
    expect(command({ autoplayPending: false, resumeWhenAllowed: false })).toBe(
      'none',
    );
  });

  it('自动播放已执行后不因重新进入页面再次播放', () => {
    expect(command({ autoplayPending: false, resumeWhenAllowed: false })).toBe(
      'none',
    );
  });

  it('外部暂停始终优先于可见性恢复', () => {
    expect(command({ pause: true, resumeWhenAllowed: true })).toBe('none');
    expect(
      command({ pause: true, playing: true, resumeWhenAllowed: true }),
    ).toBe('pause');
  });

  it('关闭可见性监听后保持原自动播放语义', () => {
    expect(
      command({
        visibilityEnabled: false,
        visibilityMeasured: false,
        visible: false,
      }),
    ).toBe('play');
  });
});
