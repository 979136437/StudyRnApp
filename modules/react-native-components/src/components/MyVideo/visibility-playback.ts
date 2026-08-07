export type VisibilityPlaybackCommand = 'none' | 'pause' | 'play';

export interface VisibilityPlaybackContext {
  autoplayPending: boolean;
  pause: boolean;
  playing: boolean;
  resumeWhenAllowed: boolean;
  visibilityEnabled: boolean;
  visibilityMeasured: boolean;
  visible: boolean;
}

export function resolveVisibilityPlaybackCommand({
  autoplayPending,
  pause,
  playing,
  resumeWhenAllowed,
  visibilityEnabled,
  visibilityMeasured,
  visible,
}: VisibilityPlaybackContext): VisibilityPlaybackCommand {
  const blockedByVisibility =
    visibilityEnabled && (!visibilityMeasured || !visible);

  if (pause || blockedByVisibility) {
    return playing ? 'pause' : 'none';
  }

  if (autoplayPending || resumeWhenAllowed) {
    return playing ? 'none' : 'play';
  }

  return 'none';
}
