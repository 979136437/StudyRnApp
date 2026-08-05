import type { ReactNode } from 'react';

import type {
  HidePromptOptions,
  ModalResult,
  PopupApi,
  PopupCallbackResult,
  PopupCallbacks,
  PopupCloseReason,
  PopupErrorCode,
  PopupErrorResult,
  PopupId,
  PopupKind,
  PopupPlacement,
  PopupResult,
  PopupTask,
  ShowLoadingOptions,
  ShowModalOptions,
  ShowPopupOptions,
  ShowToastOptions,
} from '../types';
import { DEFAULT_TOAST_DURATION, POPUP_ANIMATION_DURATION } from './constants';
import {
  allocatePopupId,
  claimPopupId,
  nextPopupOrder,
  releasePopupId,
} from './registry';

const CALLBACK_ERROR_DELAY = 0;
const BUTTON_TEXT_LIMIT = 4;
const HEX_COLOR_PATTERN = /^#[\da-f]{6}$/i;

export class PopupError extends Error implements PopupErrorResult {
  readonly errMsg: string;

  constructor(
    readonly code: PopupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PopupError';
    this.errMsg = message;
  }
}

interface Lifecycle<TResult extends PopupCallbackResult> {
  readonly task: PopupTask<TResult>;
  succeed(result: TResult): void;
  fail(error: PopupError): void;
  isSettled(): boolean;
}

interface ManagedInstanceBase<TResult extends PopupCallbackResult> {
  id: PopupId;
  order: number;
  closing: boolean;
  mask: boolean;
  /** 仅表示是否进入阻塞展示队列；所有可见 Layer 都会拦截宿主区域操作。 */
  blocking: boolean;
  closeOnBackPress: boolean;
  lifecycle: Lifecycle<TResult>;
}

export interface ManagedPopupInstance extends ManagedInstanceBase<PopupResult> {
  kind: 'popup';
  options: ShowPopupOptions;
  placement: PopupPlacement;
}

export interface ManagedToastInstance extends ManagedInstanceBase<PopupCallbackResult> {
  kind: 'toast';
  options: ShowToastOptions;
}

export interface ManagedLoadingInstance extends ManagedInstanceBase<PopupCallbackResult> {
  kind: 'loading';
  options: ShowLoadingOptions;
}

export interface ManagedModalInstance extends ManagedInstanceBase<ModalResult> {
  kind: 'modal';
  options: ShowModalOptions;
  inputValue: string;
}

export type ManagedPopup =
  | ManagedPopupInstance
  | ManagedToastInstance
  | ManagedLoadingInstance
  | ManagedModalInstance;

export interface PopupSnapshot {
  visible: readonly ManagedPopup[];
  queue: readonly ManagedPopup[];
  prompt: ManagedToastInstance | ManagedLoadingInstance | null;
}

type Listener = () => void;

function reportCallbackError(error: unknown): void {
  // 用户回调异常不能破坏内部 Promise 的单次结算，因此脱离当前调用栈再抛出。
  setTimeout(() => {
    throw error;
  }, CALLBACK_ERROR_DELAY);
}

function invokeCallback<TValue>(
  callback: ((value: TValue) => void) | undefined,
  value: TValue,
): void {
  try {
    callback?.(value);
  } catch (error) {
    reportCallbackError(error);
  }
}

function createLifecycle<TResult extends PopupCallbackResult>(
  id: PopupId,
  callbacks: PopupCallbacks<TResult>,
): Lifecycle<TResult> {
  let resolveTask: (result: TResult) => void = () => undefined;
  let rejectTask: (error: PopupError) => void = () => undefined;
  let settled = false;
  const task = new Promise<TResult>((resolve, reject) => {
    resolveTask = resolve;
    rejectTask = reject;
  }) as PopupTask<TResult>;
  Object.defineProperty(task, 'id', { enumerable: true, value: id });

  return {
    task,
    isSettled: () => settled,
    succeed(result) {
      if (settled) return;
      settled = true;
      invokeCallback(callbacks.success, result);
      invokeCallback(callbacks.complete, result);
      resolveTask(result);
    },
    fail(error) {
      if (settled) return;
      settled = true;
      invokeCallback(callbacks.fail, error);
      invokeCallback(callbacks.complete, error);
      rejectTask(error);
    },
  };
}

export function createFailedTask<TResult extends PopupCallbackResult>(
  options: PopupCallbacks<TResult> & { id?: PopupId },
  code: PopupErrorCode,
  message: string,
): PopupTask<TResult> {
  const id = options.id?.trim() ? options.id : allocatePopupId();
  const lifecycle = createLifecycle<TResult>(id, options);
  lifecycle.fail(new PopupError(code, message));
  return lifecycle.task;
}

function validateId(id?: PopupId): void {
  if (id !== undefined && id.trim().length === 0) {
    throw new PopupError('INVALID_OPTIONS', 'popup:fail id 不能为空');
  }
}

function validateTitle(title: ReactNode, method: string): void {
  const isEmpty =
    title === null ||
    title === undefined ||
    typeof title === 'boolean' ||
    (typeof title === 'string' && title.trim().length === 0);
  if (isEmpty) {
    throw new PopupError('INVALID_OPTIONS', `${method}:fail title 不能为空`);
  }
}

function validateButton(text: ReactNode, name: string): void {
  // ReactNode 无法按字符计数，微信式四字限制仅对字符串按钮文案生效。
  if (typeof text === 'string' && Array.from(text).length > BUTTON_TEXT_LIMIT) {
    throw new PopupError(
      'INVALID_OPTIONS',
      `showModal:fail ${name} 最多 4 个字符`,
    );
  }
}

function validateColor(color: string | undefined, name: string): void {
  if (color !== undefined && !HEX_COLOR_PATTERN.test(color)) {
    throw new PopupError(
      'INVALID_OPTIONS',
      `showModal:fail ${name} 必须是 #RRGGBB 格式`,
    );
  }
}

function normalizedDuration(duration?: number): number {
  const value = duration ?? DEFAULT_TOAST_DURATION;
  if (!Number.isFinite(value) || value < 0) {
    throw new PopupError(
      'INVALID_OPTIONS',
      'showToast:fail duration 必须是非负有限数值',
    );
  }
  return value;
}

function successResult(method: string): PopupCallbackResult {
  return { errMsg: `${method}:ok` };
}

export class PopupController implements PopupApi {
  private visible: ManagedPopup[] = [];
  private queue: ManagedPopup[] = [];
  private prompt: ManagedToastInstance | ManagedLoadingInstance | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly closeTimers = new Map<
    PopupId,
    ReturnType<typeof setTimeout>
  >();
  private readonly promptTimers = new Map<
    PopupId,
    ReturnType<typeof setTimeout>
  >();
  private readonly closeReasons = new Map<PopupId, PopupCloseReason>();
  private readonly closeResolvers = new Map<
    PopupId,
    ((closed: boolean) => void)[]
  >();
  private snapshot: PopupSnapshot = { visible: [], queue: [], prompt: null };
  private animationDuration = POPUP_ANIMATION_DURATION;
  private disposed = false;

  /** React 严格模式会重复执行 Effect，重新挂载时需恢复同一个控制器。 */
  mount(): void {
    this.disposed = false;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): PopupSnapshot => this.snapshot;

  setAnimationDuration(duration: number): void {
    this.animationDuration = Math.max(0, duration);
  }

  private emit(): void {
    this.snapshot = {
      visible: [...this.visible],
      queue: [...this.queue],
      prompt: this.prompt,
    };
    for (const listener of this.listeners) listener();
  }

  private prepare<TResult extends PopupCallbackResult>(
    options: PopupCallbacks<TResult> & { id?: PopupId },
  ): { id: PopupId; lifecycle: Lifecycle<TResult> } {
    validateId(options.id);
    if (this.disposed) {
      throw new PopupError('HOST_UNMOUNTED', 'popup:fail 宿主已卸载');
    }
    const id = allocatePopupId(options.id);
    if (!claimPopupId(id, this)) {
      throw new PopupError('DUPLICATE_ID', `popup:fail id ${id} 已存在`);
    }
    return { id, lifecycle: createLifecycle(id, options) };
  }

  private reject<TResult extends PopupCallbackResult>(
    options: PopupCallbacks<TResult> & { id?: PopupId },
    error: unknown,
  ): PopupTask<TResult> {
    const popupError =
      error instanceof PopupError
        ? error
        : new PopupError('INVALID_OPTIONS', 'popup:fail 参数无效');
    return createFailedTask(options, popupError.code, popupError.message);
  }

  private enqueue(instance: ManagedPopup): void {
    // 遮罩实例必须串行，无遮罩 Popup 则保留并行可见能力。
    const hasBlocking = this.visible.some(
      (item) => item.blocking && !item.closing,
    );
    if (instance.blocking && hasBlocking) this.queue.push(instance);
    else this.visible.push(instance);
    this.emit();
  }

  showPopup = (options: ShowPopupOptions): PopupTask<PopupResult> => {
    try {
      if (options.content === undefined && options.component === undefined) {
        throw new PopupError(
          'INVALID_OPTIONS',
          'showPopup:fail content 与 component 不能同时为空',
        );
      }
      const { id, lifecycle } = this.prepare(options);
      this.enqueue({
        id,
        lifecycle,
        kind: 'popup',
        options,
        order: nextPopupOrder(),
        placement: options.placement ?? 'center',
        mask: options.mask ?? true,
        blocking: options.mask ?? true,
        closeOnBackPress: options.closeOnBackPress ?? true,
        closing: false,
      });
      return lifecycle.task;
    } catch (error) {
      return this.reject(options, error);
    }
  };

  showToast = (options: ShowToastOptions): PopupTask<PopupCallbackResult> => {
    try {
      validateTitle(options.title, 'showToast');
      const duration = normalizedDuration(options.duration);
      const { id, lifecycle } = this.prepare(options);
      this.replacePrompt('replaced');
      this.prompt = {
        id,
        lifecycle,
        kind: 'toast',
        options: { ...options, duration },
        order: nextPopupOrder(),
        // Toast 不暴露视觉遮罩配置，交互拦截统一由 PopupLayer 的透明覆盖层负责。
        mask: false,
        blocking: false,
        closeOnBackPress: false,
        closing: false,
      };
      lifecycle.succeed(successResult('showToast'));
      if (duration === 0) void this.close(id, 'timeout');
      else {
        this.promptTimers.set(
          id,
          setTimeout(() => void this.close(id, 'timeout'), duration),
        );
      }
      this.emit();
      return lifecycle.task;
    } catch (error) {
      return this.reject(options, error);
    }
  };

  showLoading = (
    options: ShowLoadingOptions,
  ): PopupTask<PopupCallbackResult> => {
    try {
      validateTitle(options.title, 'showLoading');
      const { id, lifecycle } = this.prepare(options);
      this.replacePrompt('replaced');
      this.prompt = {
        id,
        lifecycle,
        kind: 'loading',
        options,
        order: nextPopupOrder(),
        // Loading 固定保持背景透明，页面交互仍由全屏透明覆盖层拦截。
        mask: false,
        blocking: false,
        closeOnBackPress: false,
        closing: false,
      };
      lifecycle.succeed(successResult('showLoading'));
      this.emit();
      return lifecycle.task;
    } catch (error) {
      return this.reject(options, error);
    }
  };

  showModal = (options: ShowModalOptions): PopupTask<ModalResult> => {
    try {
      validateId(options.id);
      validateButton(options.cancelText, 'cancelText');
      validateButton(options.confirmText, 'confirmText');
      validateColor(options.cancelColor, 'cancelColor');
      validateColor(options.confirmColor, 'confirmColor');
      const { id, lifecycle } = this.prepare(options);
      this.enqueue({
        id,
        lifecycle,
        kind: 'modal',
        options,
        inputValue: '',
        order: nextPopupOrder(),
        mask: true,
        blocking: true,
        closeOnBackPress: false,
        closing: false,
      });
      return lifecycle.task;
    } catch (error) {
      return this.reject(options, error);
    }
  };

  hideToast = (options: HidePromptOptions = {}): Promise<PopupCallbackResult> =>
    this.hidePrompt('toast', 'hideToast', options);

  hideLoading = (
    options: HidePromptOptions = {},
  ): Promise<PopupCallbackResult> =>
    this.hidePrompt('loading', 'hideLoading', options);

  private async hidePrompt(
    kind: 'toast' | 'loading',
    method: string,
    options: HidePromptOptions,
  ): Promise<PopupCallbackResult> {
    const result = successResult(method);
    if (
      this.prompt !== null &&
      (!options.noConflict || this.prompt.kind === kind)
    ) {
      await this.close(this.prompt.id, 'api');
    }
    invokeCallback(options.success, result);
    invokeCallback(options.complete, result);
    return result;
  }

  private replacePrompt(reason: PopupCloseReason): void {
    if (this.prompt === null) return;
    const replaced = this.prompt;
    this.prompt = null;
    // 替换提示时先清除旧计时器，避免旧 Toast 超时后误关新提示。
    this.clearInstanceTimers(replaced.id);
    releasePopupId(replaced.id, this);
    this.resolveCloseWaiters(replaced.id, true);
    if (!replaced.lifecycle.isSettled()) {
      this.finishSuccess(replaced, reason);
    }
  }

  async close(id: PopupId, reason: PopupCloseReason): Promise<boolean> {
    const queuedIndex = this.queue.findIndex((item) => item.id === id);
    if (queuedIndex >= 0) {
      const [instance] = this.queue.splice(queuedIndex, 1);
      if (instance === undefined) return false;
      this.finalize(instance, reason);
      this.emit();
      return true;
    }

    const instance =
      this.prompt?.id === id
        ? this.prompt
        : this.visible.find((item) => item.id === id);
    if (instance === undefined || instance.closing) {
      if (instance?.closing) {
        return new Promise((resolve) => {
          const waiters = this.closeResolvers.get(id) ?? [];
          waiters.push(resolve);
          this.closeResolvers.set(id, waiters);
        });
      }
      return false;
    }

    instance.closing = true;
    this.closeReasons.set(id, reason);
    this.clearInstanceTimers(id);
    this.emit();

    const result = new Promise<boolean>((resolve) => {
      const waiters = this.closeResolvers.get(id) ?? [];
      waiters.push(resolve);
      this.closeResolvers.set(id, waiters);
    });

    const fallbackDelay = this.animationDuration + 50;
    // 渲染层可能被卸载或动画回调丢失，兜底计时器确保关闭任务最终完成。
    this.closeTimers.set(
      id,
      setTimeout(() => this.completeClose(id), fallbackDelay),
    );
    if (this.animationDuration === 0) this.completeClose(id);
    return result;
  }

  completeClose(id: PopupId): void {
    const instance =
      this.prompt?.id === id
        ? this.prompt
        : this.visible.find((item) => item.id === id);
    if (instance === undefined || !instance.closing) return;
    const reason = this.closeReasons.get(id) ?? 'api';
    this.finalize(instance, reason);
    this.emit();
  }

  respondModal(id: PopupId, confirm: boolean): void {
    const modal = this.visible.find(
      (item): item is ManagedModalInstance =>
        item.id === id && item.kind === 'modal',
    );
    if (modal === undefined || modal.closing) return;
    void this.close(id, confirm ? 'confirm' : 'cancel');
  }

  setModalInput(id: PopupId, value: string): void {
    const modal = this.visible.find(
      (item): item is ManagedModalInstance =>
        item.id === id && item.kind === 'modal',
    );
    if (modal !== undefined && modal.inputValue !== value) {
      modal.inputValue = value;
      // 自定义 Modal 通过 props 接收输入值，更新后通知宿主保持受控组件同步。
      this.emit();
    }
  }

  private finalize(instance: ManagedPopup, reason: PopupCloseReason): void {
    if (this.prompt?.id === instance.id) this.prompt = null;
    else this.visible = this.visible.filter((item) => item.id !== instance.id);
    this.queue = this.queue.filter((item) => item.id !== instance.id);
    this.clearInstanceTimers(instance.id);
    this.closeReasons.delete(instance.id);
    releasePopupId(instance.id, this);
    this.finishSuccess(instance, reason);
    this.resolveCloseWaiters(instance.id, true);
    this.activateNextBlocking();
  }

  private finishSuccess(
    instance: ManagedPopup,
    reason: PopupCloseReason,
  ): void {
    if (instance.lifecycle.isSettled()) return;
    if (instance.kind === 'modal') {
      instance.lifecycle.succeed({
        id: instance.id,
        errMsg: 'showModal:ok',
        closeReason: reason,
        confirm: reason === 'confirm',
        cancel: reason !== 'confirm',
        content: instance.inputValue,
      });
      return;
    }
    if (instance.kind === 'popup') {
      instance.lifecycle.succeed({
        id: instance.id,
        errMsg: 'showPopup:ok',
        closeReason: reason,
      });
      return;
    }
    instance.lifecycle.succeed(successResult(`show${instance.kind}`));
  }

  private activateNextBlocking(): void {
    // 当前阻塞层结束后仅激活队首，保证 Modal 与遮罩 Popup 按调用顺序展示。
    if (this.visible.some((item) => item.blocking && !item.closing)) return;
    const nextIndex = this.queue.findIndex((item) => item.blocking);
    if (nextIndex < 0) return;
    const [next] = this.queue.splice(nextIndex, 1);
    if (next !== undefined) this.visible.push(next);
  }

  private clearInstanceTimers(id: PopupId): void {
    const promptTimer = this.promptTimers.get(id);
    if (promptTimer !== undefined) clearTimeout(promptTimer);
    this.promptTimers.delete(id);
    const closeTimer = this.closeTimers.get(id);
    if (closeTimer !== undefined) clearTimeout(closeTimer);
    this.closeTimers.delete(id);
  }

  private resolveCloseWaiters(id: PopupId, closed: boolean): void {
    const waiters = this.closeResolvers.get(id) ?? [];
    this.closeResolvers.delete(id);
    for (const resolve of waiters) resolve(closed);
  }

  getTopBackCandidate(): { id: PopupId; order: number } | null {
    let candidate: ManagedPopup | null = null;
    for (const instance of this.visible) {
      if (
        instance.closeOnBackPress &&
        !instance.closing &&
        (candidate === null || instance.order > candidate.order)
      ) {
        candidate = instance;
      }
    }
    return candidate === null
      ? null
      : { id: candidate.id, order: candidate.order };
  }

  getKind(id: PopupId): PopupKind | undefined {
    const instance =
      this.prompt?.id === id
        ? this.prompt
        : [...this.visible, ...this.queue].find((item) => item.id === id);
    return instance?.kind;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const instances = [
      ...this.visible,
      ...this.queue,
      ...(this.prompt === null ? [] : [this.prompt]),
    ];
    const error = new PopupError('HOST_UNMOUNTED', 'popup:fail 宿主已卸载');
    for (const instance of instances) {
      this.clearInstanceTimers(instance.id);
      this.closeReasons.delete(instance.id);
      releasePopupId(instance.id, this);
      if (!instance.lifecycle.isSettled()) instance.lifecycle.fail(error);
      this.resolveCloseWaiters(instance.id, false);
    }
    this.visible = [];
    this.queue = [];
    this.prompt = null;
    this.snapshot = { visible: [], queue: [], prompt: null };
  }
}
