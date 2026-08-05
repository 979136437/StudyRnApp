import { BackHandler, type NativeEventSubscription } from 'react-native';

import type { PopupId, PopupScope } from '../types';
import type { PopupController } from './controller';

const POPUP_ID_PREFIX = 'popup';

const hosts = new Set<PopupController>();
const globalHosts: PopupController[] = [];
const owners = new Map<PopupId, PopupController>();

let idSequence = 0;
let orderSequence = 0;
let backSubscription: NativeEventSubscription | null = null;

function handleHardwareBack(): boolean {
  let candidate: {
    controller: PopupController;
    id: PopupId;
    order: number;
  } | null = null;

  // 返回键在注册表统一仲裁，避免每个 Provider 都重复消费同一次事件。
  for (const controller of hosts) {
    const next = controller.getTopBackCandidate();
    if (next !== null && (candidate === null || next.order > candidate.order)) {
      candidate = { controller, ...next };
    }
  }

  if (candidate === null) return false;
  void candidate.controller.close(candidate.id, 'back');
  return true;
}

function syncBackSubscription(): void {
  if (
    hosts.size > 0 &&
    backSubscription === null &&
    typeof BackHandler?.addEventListener === 'function'
  ) {
    backSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      handleHardwareBack,
    );
    return;
  }

  if (hosts.size === 0 && backSubscription !== null) {
    backSubscription.remove();
    backSubscription = null;
  }
}

export function registerHost(
  controller: PopupController,
  scope: PopupScope,
): () => void {
  hosts.add(controller);
  if (scope === 'global') globalHosts.push(controller);
  syncBackSubscription();

  return () => {
    hosts.delete(controller);
    const globalIndex = globalHosts.lastIndexOf(controller);
    if (globalIndex >= 0) globalHosts.splice(globalIndex, 1);
    syncBackSubscription();
  };
}

export function getGlobalHost(): PopupController | null {
  return globalHosts.at(-1) ?? null;
}

export function allocatePopupId(requestedId?: PopupId): PopupId {
  if (requestedId !== undefined) return requestedId;

  let id: PopupId;
  do {
    idSequence += 1;
    id = `${POPUP_ID_PREFIX}-${Date.now().toString(36)}-${idSequence.toString(36)}`;
  } while (owners.has(id));
  return id;
}

export function claimPopupId(
  id: PopupId,
  controller: PopupController,
): boolean {
  // ID 所有权集中登记，使全局 API 能定位局部 Provider 内的实例。
  if (owners.has(id)) return false;
  owners.set(id, controller);
  return true;
}

export function releasePopupId(id: PopupId, controller: PopupController): void {
  if (owners.get(id) === controller) owners.delete(id);
}

export function nextPopupOrder(): number {
  orderSequence += 1;
  return orderSequence;
}

export function findPopupOwner(id: PopupId): PopupController | null {
  return owners.get(id) ?? null;
}

export function getRegisteredPopupIds(): PopupId[] {
  return [...owners.keys()];
}

export function resetRegistryForTests(): void {
  owners.clear();
  hosts.clear();
  globalHosts.splice(0);
  idSequence = 0;
  orderSequence = 0;
  syncBackSubscription();
}
