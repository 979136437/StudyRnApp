export interface HeroRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export type HeroTransitionPhase =
  | 'idle'
  | 'waiting-target'
  | 'entering'
  | 'shown'
  | 'returning';

export interface HeroTransitionModel {
  activeId: string | null;
  phase: HeroTransitionPhase;
}

export type HeroTransitionEvent =
  | { id: string; type: 'begin-enter' }
  | { id: string; type: 'target-ready' }
  | { id: string; type: 'enter-finished' }
  | { id: string; type: 'begin-return' }
  | { id: string; type: 'return-finished' }
  | { type: 'reset' };

export const INITIAL_HERO_TRANSITION_MODEL: HeroTransitionModel = {
  activeId: null,
  phase: 'idle',
};

export function transitionHeroModel(
  model: HeroTransitionModel,
  event: HeroTransitionEvent,
): HeroTransitionModel {
  if (event.type === 'reset') {
    return INITIAL_HERO_TRANSITION_MODEL;
  }

  if (event.type === 'begin-enter' && model.phase === 'idle') {
    return { activeId: event.id, phase: 'waiting-target' };
  }

  if (event.id !== model.activeId) {
    return model;
  }

  if (event.type === 'target-ready' && model.phase === 'waiting-target') {
    return { ...model, phase: 'entering' };
  }

  if (event.type === 'enter-finished' && model.phase === 'entering') {
    return { ...model, phase: 'shown' };
  }

  if (event.type === 'begin-return' && model.phase === 'shown') {
    return { ...model, phase: 'returning' };
  }

  if (event.type === 'return-finished' && model.phase === 'returning') {
    return INITIAL_HERO_TRANSITION_MODEL;
  }

  return model;
}

export function isValidHeroRect(rect: HeroRect | null): rect is HeroRect {
  return (
    rect !== null &&
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

export function interpolateHeroRect(
  from: HeroRect,
  to: HeroRect,
  progress: number,
): HeroRect {
  const boundedProgress = Math.min(1, Math.max(0, progress));
  const interpolate = (start: number, end: number): number =>
    start + (end - start) * boundedProgress;

  return {
    height: interpolate(from.height, to.height),
    width: interpolate(from.width, to.width),
    x: interpolate(from.x, to.x),
    y: interpolate(from.y, to.y),
  };
}

export function returnTransitionMode(
  sourceRect: HeroRect | null,
): 'move' | 'fade' {
  return isValidHeroRect(sourceRect) ? 'move' : 'fade';
}

export function isHeroGestureEnabled(
  model: HeroTransitionModel,
  id: string,
): boolean {
  return (
    model.activeId !== id || model.phase === 'idle' || model.phase === 'shown'
  );
}

export function shouldResetHeroOnRouteUnmount(
  model: HeroTransitionModel,
  id: string,
): boolean {
  return model.activeId === id && model.phase !== 'returning';
}
