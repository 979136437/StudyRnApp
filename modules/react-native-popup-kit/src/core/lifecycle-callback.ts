export function invokeLifecycleCallback(callback?: () => void): void {
  if (callback === undefined) return;
  try {
    const result: unknown = callback();
    if (result instanceof Promise) void result.catch(() => undefined);
  } catch {
    // Lifecycle callbacks cannot interrupt popup cleanup.
  }
}
