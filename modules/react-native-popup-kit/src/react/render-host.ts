import type { PopupController } from '../core/controller';

type Listener = () => void;

export class PopupRenderHost {
  private readonly controllers = new Set<PopupController>();
  private readonly controllerKeys = new WeakMap<PopupController, string>();
  private readonly listeners = new Set<Listener>();
  private readonly layerListeners = new Set<Listener>();
  private readonly controllerSubscriptions = new Map<
    PopupController,
    () => void
  >();
  private snapshot: readonly PopupController[] = [];
  private hasVisibleLayers = false;
  private keySequence = 0;

  constructor(rootController: PopupController) {
    this.controllers.add(rootController);
    this.assignKey(rootController);
    this.trackController(rootController);
    this.snapshot = [rootController];
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): readonly PopupController[] => this.snapshot;

  subscribeLayers = (listener: Listener): (() => void) => {
    this.layerListeners.add(listener);
    return () => this.layerListeners.delete(listener);
  };

  getLayerSnapshot = (): boolean => this.hasVisibleLayers;

  register(controller: PopupController): () => void {
    if (!this.controllers.has(controller)) {
      this.controllers.add(controller);
      this.assignKey(controller);
      this.trackController(controller);
      this.emit();
    }

    return () => {
      if (this.controllers.delete(controller)) {
        this.controllerSubscriptions.get(controller)?.();
        this.controllerSubscriptions.delete(controller);
        this.emit();
        this.refreshLayerSnapshot();
      }
    };
  }

  getControllerKey(controller: PopupController): string {
    return this.assignKey(controller);
  }

  dispose(): void {
    for (const unsubscribe of this.controllerSubscriptions.values()) {
      unsubscribe();
    }
    this.controllerSubscriptions.clear();
    this.layerListeners.clear();
    this.listeners.clear();
  }

  private trackController(controller: PopupController): void {
    if (this.controllerSubscriptions.has(controller)) return;
    this.controllerSubscriptions.set(
      controller,
      controller.subscribe(this.refreshLayerSnapshot),
    );
    this.refreshLayerSnapshot();
  }

  private refreshLayerSnapshot = (): void => {
    const next = [...this.controllers].some((controller) => {
      const snapshot = controller.getSnapshot();
      return snapshot.visible.length > 0 || snapshot.prompt !== null;
    });
    if (next === this.hasVisibleLayers) return;
    this.hasVisibleLayers = next;
    for (const listener of this.layerListeners) listener();
  };

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
