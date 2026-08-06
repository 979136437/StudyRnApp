export type VisibilityPlaybackCommand = 'none' | 'pause' | 'play';

export interface VisibilityPlaybackContext {
  autoplay: boolean;
  pause: boolean;
  playing: boolean;
  resumeWhenVisible: boolean;
  visibilityEnabled: boolean;
  visibilityMeasured: boolean;
  visible: boolean;
}

export function resolveVisibilityPlaybackCommand({
  autoplay,
  pause,
  playing,
  resumeWhenVisible,
  visibilityEnabled,
  visibilityMeasured,
  visible,
}: VisibilityPlaybackContext): VisibilityPlaybackCommand {
  const blockedByVisibility =
    visibilityEnabled && (!visibilityMeasured || !visible);

  if (pause || blockedByVisibility) {
    return playing ? 'pause' : 'none';
  }

  if (autoplay || resumeWhenVisible) {
    return playing ? 'none' : 'play';
  }

  return 'none';
}
