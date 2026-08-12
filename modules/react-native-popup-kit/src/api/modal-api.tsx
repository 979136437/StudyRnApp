import { DefaultModal } from '../components/DefaultModal';
import { PopupDisplayMode, PopupMode } from '../constants';
import { invokeLifecycleCallback } from '../core/lifecycle-callback';
import type { InternalPopupController } from '../core/popup-controller';
import { createPopupId } from '../core/popup-options';
import type { ModalController, ModalOptions } from '../modal/types';
import { getGlobalPopupController } from './popup-api';

interface ModalEntry {
  controller: InternalPopupController;
  id: string;
}

const entries = new Map<InternalPopupController, ModalEntry[]>();
const controllers = new WeakMap<InternalPopupController, ModalController>();

function getEntries(controller: InternalPopupController): ModalEntry[] {
  const current = entries.get(controller);
  if (current !== undefined) return current;
  const next: ModalEntry[] = [];
  entries.set(controller, next);
  return next;
}

async function showModalWithController(
  controller: InternalPopupController,
  options: ModalOptions,
): Promise<void> {
  const id = createPopupId();
  const entry = { controller, id };
  const controllerEntries = getEntries(controller);
  controllerEntries.push(entry);
  const close = (): Promise<void> => controller.hidePopup(id);
  try {
    await controller.showInternalPopup({
      children: <DefaultModal close={close} options={options} />,
      closeOnClickOverlay: options.closeOnClickOverlay ?? true,
      displayMode: PopupDisplayMode.STACK,
      id,
      mode: PopupMode.CENTER,
      onRemoved: () => {
        const index = controllerEntries.indexOf(entry);
        if (index >= 0) controllerEntries.splice(index, 1);
        if (controllerEntries.length === 0) entries.delete(controller);
        invokeLifecycleCallback(options.onClose);
      },
      overlay: true,
    });
  } catch (error) {
    const index = controllerEntries.indexOf(entry);
    if (index >= 0) controllerEntries.splice(index, 1);
    if (controllerEntries.length === 0) entries.delete(controller);
    throw error;
  }
}

function hideModalWithController(
  controller: InternalPopupController,
): Promise<void> {
  const current = entries.get(controller);
  const entry = current?.at(-1);
  return entry === undefined
    ? Promise.resolve()
    : controller.hidePopup(entry.id);
}

export function getModalController(
  controller: InternalPopupController,
): ModalController {
  const existing = controllers.get(controller);
  if (existing !== undefined) return existing;
  const modalController: ModalController = {
    hideModal: () => hideModalWithController(controller),
    showModal: (options) => showModalWithController(controller, options),
  };
  controllers.set(controller, modalController);
  return modalController;
}

export function showModal(options: ModalOptions): Promise<void> {
  const controller = getGlobalPopupController();
  if (controller === null)
    return Promise.reject(new Error('Global PopupProvider is not mounted.'));
  return showModalWithController(controller, options);
}

export function hideModal(): Promise<void> {
  const controller = getGlobalPopupController();
  return controller === null
    ? Promise.resolve()
    : hideModalWithController(controller);
}
