import { afterEach, describe, expect, it, vi } from 'vitest';

import { closeAllPopups, closePopup } from '../../api';
import { PopupController, PopupError } from '../controller';
import { registerHost, resetRegistryForTests } from '../registry';
import { triggerHardwareBack } from './react-native.mock';

interface MountedController {
  controller: PopupController;
  unmount: () => void;
}

function mountController(
  scope: 'global' | 'local' = 'local',
): MountedController {
  const controller = new PopupController();
  controller.mount();
  controller.setAnimationDuration(0);
  const unregister = registerHost(controller, scope);
  return {
    controller,
    unmount: () => {
      unregister();
      controller.dispose();
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  resetRegistryForTests();
});

describe('PopupController', () => {
  it('Popup 可仅通过 component 提供渲染内容', async () => {
    const { controller, unmount } = mountController();
    const Component = () => null;
    const task = controller.showPopup({ component: Component });

    expect(controller.getSnapshot().visible[0]?.options.component).toBe(
      Component,
    );
    await controller.close(task.id, 'api');
    await expect(task).resolves.toMatchObject({ closeReason: 'api' });
    unmount();
  });

  it('按顺序展示阻塞 Popup 与 Modal', async () => {
    const { controller, unmount } = mountController();
    const popup = controller.showPopup({ content: '第一个' });
    const modal = controller.showModal({ content: '第二个' });

    expect(controller.getSnapshot().visible.map((item) => item.id)).toEqual([
      popup.id,
    ]);
    expect(controller.getSnapshot().queue.map((item) => item.id)).toEqual([
      modal.id,
    ]);

    await controller.close(popup.id, 'api');
    await expect(popup).resolves.toMatchObject({ closeReason: 'api' });
    expect(controller.getSnapshot().visible[0]?.id).toBe(modal.id);

    controller.respondModal(modal.id, true);
    await expect(modal).resolves.toMatchObject({
      cancel: false,
      closeReason: 'confirm',
      confirm: true,
    });
    unmount();
  });

  it('Toast 与 Loading 共用提示槽并遵守 noConflict', async () => {
    const { controller, unmount } = mountController();
    const toast = controller.showToast({ duration: 10_000, title: '已保存' });
    const loading = controller.showLoading({ title: '加载中' });

    await expect(toast).resolves.toEqual({ errMsg: 'showToast:ok' });
    await expect(loading).resolves.toEqual({ errMsg: 'showLoading:ok' });
    expect(controller.getSnapshot().prompt?.kind).toBe('loading');

    await controller.hideToast({ noConflict: true });
    expect(controller.getSnapshot().prompt?.kind).toBe('loading');
    await controller.hideToast();
    expect(controller.getSnapshot().prompt).toBeNull();
    unmount();
  });

  it('旧 Toast 定时器不会关闭替换后的提示', async () => {
    vi.useFakeTimers();
    const { controller, unmount } = mountController();
    controller.showToast({ duration: 100, title: '旧提示' });
    const current = controller.showToast({ duration: 500, title: '新提示' });

    await vi.advanceTimersByTimeAsync(100);
    expect(controller.getSnapshot().prompt?.id).toBe(current.id);
    await vi.advanceTimersByTimeAsync(400);
    expect(controller.getSnapshot().prompt).toBeNull();
    unmount();
  });

  it('重复 ID 拒绝新实例且保留原实例', async () => {
    const { controller, unmount } = mountController();
    const first = controller.showLoading({ id: 'shared', title: '第一个' });
    const duplicate = controller.showModal({ id: 'shared', title: '第二个' });

    await expect(first).resolves.toEqual({ errMsg: 'showLoading:ok' });
    await expect(duplicate).rejects.toMatchObject({ code: 'DUPLICATE_ID' });
    expect(controller.getSnapshot().prompt?.id).toBe('shared');
    await controller.hideLoading();
    unmount();
  });

  it('宿主卸载会拒绝尚未完成的任务', async () => {
    const { controller, unmount } = mountController();
    const task = controller.showPopup({ content: '等待关闭' });

    unmount();
    await expect(task).rejects.toEqual(
      expect.objectContaining<Partial<PopupError>>({ code: 'HOST_UNMOUNTED' }),
    );
  });

  it('Modal 返回编辑内容且回调只执行一次', async () => {
    const { controller, unmount } = mountController();
    const success = vi.fn();
    const complete = vi.fn();
    const task = controller.showModal({
      editable: true,
      success,
      complete,
    });

    controller.setModalInput(task.id, '用户输入');
    controller.respondModal(task.id, true);
    await expect(task).resolves.toMatchObject({
      confirm: true,
      content: '用户输入',
    });
    controller.respondModal(task.id, false);

    expect(success).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('自动生成不同 ID 并在参数错误时调用失败回调一次', async () => {
    const { controller, unmount } = mountController();
    const first = controller.showLoading({ title: '一' });
    const fail = vi.fn();
    const complete = vi.fn();
    const invalid = controller.showToast({ title: '', fail, complete });

    expect(first.id).not.toBe(invalid.id);
    await expect(invalid).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
    expect(fail).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
    await controller.hideLoading();
    unmount();
  });
});

describe('跨宿主关闭 API', () => {
  it('可以通过 ID 关闭局部宿主实例', async () => {
    const local = mountController('local');
    const task = local.controller.showPopup({ content: '局部内容' });

    await expect(closePopup(task.id)).resolves.toMatchObject({
      closed: true,
      id: task.id,
      kind: 'popup',
    });
    await expect(task).resolves.toMatchObject({ closeReason: 'api' });
    local.unmount();
  });

  it('关闭全部会覆盖全局、局部与排队实例', async () => {
    const global = mountController('global');
    const local = mountController('local');
    const first = global.controller.showModal({ title: '全局一' });
    const queued = global.controller.showModal({ title: '全局二' });
    const localPopup = local.controller.showPopup({ content: '局部' });

    const result = await closeAllPopups();
    expect(result.closed).toBe(3);
    expect(new Set(result.ids)).toEqual(
      new Set([first.id, queued.id, localPopup.id]),
    );
    await expect(first).resolves.toMatchObject({ closeReason: 'all' });
    await expect(queued).resolves.toMatchObject({ closeReason: 'all' });
    await expect(localPopup).resolves.toMatchObject({ closeReason: 'all' });
    global.unmount();
    local.unmount();
  });

  it('返回键只关闭所有宿主中最顶层的可关闭实例', async () => {
    const firstHost = mountController('global');
    const secondHost = mountController('local');
    const first = firstHost.controller.showPopup({ content: '先打开' });
    const second = secondHost.controller.showPopup({ content: '后打开' });

    expect(triggerHardwareBack()).toBe(true);
    await expect(second).resolves.toMatchObject({ closeReason: 'back' });
    expect(firstHost.controller.getSnapshot().visible[0]?.id).toBe(first.id);
    await firstHost.controller.close(first.id, 'api');
    firstHost.unmount();
    secondHost.unmount();
  });
});
