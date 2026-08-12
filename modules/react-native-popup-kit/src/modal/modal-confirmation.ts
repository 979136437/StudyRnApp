import { invokeLifecycleCallback } from '../core/lifecycle-callback';
import type { ModalOptions } from './types';

export interface ModalConfirmationController {
  isConfirming(): boolean;
  cancel(): void;
  confirm(): Promise<boolean>;
}

export function createModalConfirmationController(
  options: Pick<ModalOptions, 'onCancel' | 'onConfirm'>,
): ModalConfirmationController {
  let confirming = false;
  return {
    isConfirming: () => confirming,
    cancel(): void {
      if (confirming) return;
      invokeLifecycleCallback(options.onCancel);
    },
    async confirm(): Promise<boolean> {
      if (confirming) return false;
      if (options.onConfirm === undefined) return true;
      confirming = true;
      try {
        return await options.onConfirm();
      } catch {
        return false;
      } finally {
        confirming = false;
      }
    },
  };
}
