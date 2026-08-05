import type { PopupController } from '../core/controller';

type Listener = () => void;

export class PopupRenderHost {
  private readonly controllers = new Set<PopupController>();
  private readonly controllerKeys = new WeakMap<PopupController, string>();
  private readonly listeners = new Set<Listener>();
  private snapshot: readonly PopupController[] = [];
  private keySequence = 0;

  constructor(rootController: PopupController) {
    this.controllers.add(rootController);
    this.assignKey(rootController);
    this.snapshot = [rootController];
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): readonly PopupController[] => this.snapshot;

  register(controller: PopupController): () => void {
    if (!this.controllers.has(controller)) {
      this.controllers.add(controller);
      this.assignKey(controller);
      this.emit();
    }

    return () => {
      if (this.controllers.delete(controller)) this.emit();
    };
  }

  getControllerKey(controller: PopupController): string {
    return this.assignKey(controller);
  }

  private assignKey(controller: PopupController): string {
    const existing = this.controllerKeys.get(controller);
    if (existing !== undefined) return existing;
    this.keySequence += 1;
    const key = `popup-render-controller-${this.keySequence}`;
    this.controllerKeys.set(controller, key);
    return key;
  }

  private emit(): void {
    // 使用稳定快照配合 useSyncExternalStore，避免局部宿主注册时出现撕裂。
    this.snapshot = [...this.controllers];
    for (const listener of this.listeners) listener();
  }
}
