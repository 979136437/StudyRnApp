import { VisibilityTransitionController } from './core/transition';
import type { NormalizedVisibilityOptions } from './core/visibility';
import type { VisibilityChangeEvent } from './types';

export function observeWebVisibility(
  element: Element,
  options: NormalizedVisibilityOptions,
  onChange: (event: VisibilityChangeEvent) => void,
): () => void {
  const controller = new VisibilityTransitionController(
    options.threshold,
    options.minimumVisibleDurationMs,
    onChange,
  );
  let latestRatio = 0;

  const isForeground = () => document.visibilityState === 'visible';
  const onDocumentVisibilityChange = () => {
    controller.update(latestRatio, isForeground(), options.enabled);
  };

  document.addEventListener('visibilitychange', onDocumentVisibilityChange);

  if (!options.enabled) {
    controller.update(0, isForeground(), false);
    return () => {
      document.removeEventListener(
        'visibilitychange',
        onDocumentVisibilityChange,
      );
      controller.dispose();
    };
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1];
      if (entry === undefined) return;
      latestRatio = entry.isIntersecting ? entry.intersectionRatio : 0;
      controller.update(latestRatio, isForeground(), true);
    },
    {
      threshold: options.threshold === 0 ? [0] : [0, options.threshold],
    },
  );
  observer.observe(element);

  return () => {
    observer.disconnect();
    document.removeEventListener(
      'visibilitychange',
      onDocumentVisibilityChange,
    );
    controller.dispose();
  };
}
