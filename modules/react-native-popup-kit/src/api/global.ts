import { createFailedTask } from '../core/controller';
import {
  findPopupOwner,
  getGlobalHost,
  getRegisteredPopupIds,
} from '../core/registry';
import type {
  CloseAllPopupsResult,
  ClosePopupResult,
  HidePromptOptions,
  ModalResult,
  PopupCallbacks,
  PopupCallbackResult,
  PopupResult,
  PopupTask,
  ShowLoadingOptions,
  ShowModalOptions,
  ShowPopupOptions,
  ShowToastOptions,
} from '../types';

function unavailable<TResult extends PopupCallbackResult>(
  options: PopupCallbacks<TResult> & { id?: string },
): PopupTask<TResult> {
  return createFailedTask(
    options,
    'HOST_UNAVAILABLE',
    'popup:fail 未挂载全局 PopupProvider',
  );
}

export function showPopup(options: ShowPopupOptions): PopupTask<PopupResult> {
  return getGlobalHost()?.showPopup(options) ?? unavailable(options);
}

export function showToast(
  options: ShowToastOptions,
): PopupTask<PopupCallbackResult> {
  return getGlobalHost()?.showToast(options) ?? unavailable(options);
}

export function showLoading(
  options: ShowLoadingOptions,
): PopupTask<PopupCallbackResult> {
  return getGlobalHost()?.showLoading(options) ?? unavailable(options);
}

export function showModal(options: ShowModalOptions): PopupTask<ModalResult> {
  return getGlobalHost()?.showModal(options) ?? unavailable(options);
}

export function hideToast(
  options?: HidePromptOptions,
): Promise<PopupCallbackResult> {
  const host = getGlobalHost();
  if (host === null) {
    const task = unavailable<PopupCallbackResult>(options ?? {});
    return task;
  }
  return host.hideToast(options);
}

export function hideLoading(
  options?: HidePromptOptions,
): Promise<PopupCallbackResult> {
  const host = getGlobalHost();
  if (host === null) {
    const task = unavailable<PopupCallbackResult>(options ?? {});
    return task;
  }
  return host.hideLoading(options);
}

export async function closePopup(id: string): Promise<ClosePopupResult> {
  const owner = findPopupOwner(id);
  if (owner === null) return { id, closed: false, closeReason: 'api' };
  const kind = owner.getKind(id);
  const closed = await owner.close(id, 'api');
  return { id, closed, kind, closeReason: 'api' };
}

export async function closeAllPopups(): Promise<CloseAllPopupsResult> {
  // 先快照 ID，关闭期间队列激活不会改变本次全部关闭的目标集合。
  const ids = getRegisteredPopupIds();
  const results = await Promise.all(
    ids.map(async (id) => {
      const owner = findPopupOwner(id);
      return owner?.close(id, 'all') ?? false;
    }),
  );
  return {
    closed: results.filter(Boolean).length,
    ids: ids.filter((_, index) => results[index]),
    closeReason: 'all',
  };
}

export const popupApi = {
  showPopup,
  closePopup,
  closeAllPopups,
  showToast,
  hideToast,
  showLoading,
  hideLoading,
  showModal,
};
