import { use } from 'react';

import type { LoadingApi, ModalApi, PopupApi, ToastApi } from '../types';
import { PopupContext } from './context';

export function usePopup(): PopupApi {
  const api = use(PopupContext);
  if (api === null) {
    throw new Error('usePopup 必须在 PopupProvider 内使用');
  }
  return api;
}

export function useToast(): ToastApi {
  const api = usePopup();
  return { showToast: api.showToast, hideToast: api.hideToast };
}

export function useLoading(): LoadingApi {
  const api = usePopup();
  return { showLoading: api.showLoading, hideLoading: api.hideLoading };
}

export function useModal(): ModalApi {
  const api = usePopup();
  return { showModal: api.showModal };
}
