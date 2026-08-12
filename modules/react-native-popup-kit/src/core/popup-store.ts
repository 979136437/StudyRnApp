import { PopupDisplayMode } from '../constants';
import type { PopupDisplayMode as PopupDisplayModeValue } from '../types';

export interface PopupItem<T> {
  id: string;
  order: number;
  value: T;
}

export interface PopupStoreSnapshot<T> {
  closingIds: ReadonlySet<string>;
  ids: readonly string[];
  queueCurrent: PopupItem<T> | null;
  stack: readonly PopupItem<T>[];
}

type Listener = () => void;
type DisplayModeSelector<T> = (value: T) => PopupDisplayModeValue;
type RemovedCallbackSelector<T> = (value: T) => (() => void) | undefined;

const EMPTY_IDS: readonly string[] = Object.freeze([]);
const EMPTY_CLOSING_IDS: ReadonlySet<string> = new Set();

export class PopupStore<T> {
  private queue: PopupItem<T>[] = [];
  private stack: PopupItem<T>[] = [];
  private closingIds = new Set<string>();
  private listeners = new Set<Listener>();
  private pendingHide = new Map<string, Array<() => void>>();
  private disposed = false;
  private snapshot: PopupStoreSnapshot<T> = {
    closingIds: EMPTY_CLOSING_IDS,
    ids: EMPTY_IDS,
    queueCurrent: null,
    stack: [],
  };

  constructor(
    private readonly getDisplayMode: DisplayModeSelector<T>,
    private readonly getRemovedCallback?: RemovedCallbackSelector<T>,
  ) {}

  getSnapshot = (): PopupStoreSnapshot<T> => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  add(id: string, order: number, value: T): void {
    if (this.disposed) throw new Error('PopupProvider has been unmounted.');
    if (this.has(id)) throw new Error(`Popup id already exists: ${id}`);

    const item = { id, order, value };
    if (this.getDisplayMode(value) === PopupDisplayMode.STACK) {
      this.stack.push(item);
    } else this.queue.push(item);
    this.publish();
  }

  hide(id: string): Promise<void> {
    const queueIndex = this.queue.findIndex((item) => item.id === id);
    const stackIndex = this.stack.findIndex((item) => item.id === id);
    if (queueIndex < 0 && stackIndex < 0) return Promise.resolve();

    if (queueIndex > 0) {
      const [removed] = this.queue.splice(queueIndex, 1);
      this.publish();
      if (removed !== undefined) this.notifyRemoved(removed.value);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const pending = this.pendingHide.get(id) ?? [];
      pending.push(resolve);
      this.pendingHide.set(id, pending);
      if (!this.closingIds.has(id)) {
        this.closingIds.add(id);
        this.publish();
      }
    });
  }

  complete = (id: string): void => {
    if (!this.closingIds.has(id)) return;

    let removed: PopupItem<T> | undefined;
    if (this.queue[0]?.id === id) removed = this.queue.shift();
    else {
      const stackIndex = this.stack.findIndex((item) => item.id === id);
      if (stackIndex >= 0) [removed] = this.stack.splice(stackIndex, 1);
    }
    this.closingIds.delete(id);
    const pending = this.pendingHide.get(id) ?? [];
    this.pendingHide.delete(id);
    this.publish();
    if (removed !== undefined) this.notifyRemoved(removed.value);
    for (const resolve of pending) resolve();
  };

  dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    const removed = [...this.queue, ...this.stack];
    this.queue = [];
    this.stack = [];
    this.closingIds.clear();
    const pending = [...this.pendingHide.values()].flat();
    this.pendingHide.clear();
    this.publish();
    for (const item of removed) this.notifyRemoved(item.value);
    for (const resolve of pending) resolve();
    this.listeners.clear();
  };

  private has(id: string): boolean {
    return (
      this.queue.some((item) => item.id === id) ||
      this.stack.some((item) => item.id === id)
    );
  }

  private publish(): void {
    this.snapshot = {
      closingIds: new Set(this.closingIds),
      ids: [
        ...this.queue.map((item) => item.id),
        ...this.stack.map((item) => item.id),
      ],
      queueCurrent: this.queue[0] ?? null,
      stack: [...this.stack],
    };
    for (const listener of this.listeners) listener();
  }

  private notifyRemoved(value: T): void {
    try {
      this.getRemovedCallback?.(value)?.();
    } catch {
      // Consumer callbacks cannot interrupt queue cleanup.
    }
  }
}
