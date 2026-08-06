import type { VisibilityChangeEvent } from '../types';
import { meetsVisibilityThreshold } from './visibility';

type TimerHandle = ReturnType<typeof setTimeout>;

export class VisibilityTransitionController {
  private lastPublishedVisible: boolean | undefined;
  private latestRatio = 0;
  private latestForeground = true;
  private pendingTimer: TimerHandle | undefined;

  constructor(
    private readonly threshold: number,
    private readonly minimumVisibleDurationMs: number,
    private readonly publish: (event: VisibilityChangeEvent) => void,
  ) {}

  update(visibleRatio: number, foreground: boolean, enabled = true): void {
    this.latestRatio = Math.min(1, Math.max(0, visibleRatio));
    this.latestForeground = foreground;
    const candidateVisible =
      enabled &&
      foreground &&
      meetsVisibilityThreshold(this.latestRatio, this.threshold);

    if (!candidateVisible) {
      this.cancelPendingTimer();
      this.publishIfChanged(false, this.latestRatio);
      return;
    }

    if (this.lastPublishedVisible === true || this.pendingTimer !== undefined) {
      return;
    }
    if (this.minimumVisibleDurationMs === 0) {
      this.publishIfChanged(true, this.latestRatio);
      return;
    }

    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = undefined;
      if (
        this.latestForeground &&
        meetsVisibilityThreshold(this.latestRatio, this.threshold)
      ) {
        this.publishIfChanged(true, this.latestRatio);
      }
    }, this.minimumVisibleDurationMs);
  }

  dispose(): void {
    this.cancelPendingTimer();
  }

  private publishIfChanged(isVisible: boolean, visibleRatio: number): void {
    if (this.lastPublishedVisible === isVisible) return;
    this.lastPublishedVisible = isVisible;
    this.publish({ isVisible, visibleRatio });
  }

  private cancelPendingTimer(): void {
    if (this.pendingTimer === undefined) return;
    clearTimeout(this.pendingTimer);
    this.pendingTimer = undefined;
  }
}
