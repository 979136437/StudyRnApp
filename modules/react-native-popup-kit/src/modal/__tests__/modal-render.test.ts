import { describe, expect, it, vi } from 'vitest';

import { resolveModalCustomContent } from '../modal-render';
import type { ModalFooterRenderProps } from '../types';

const footerProps: ModalFooterRenderProps = {
  cancel: { text: '取消' },
  confirm: { text: '确定' },
  confirming: false,
  onCancel: vi.fn(),
  onConfirm: vi.fn(async () => undefined),
};

describe('resolveModalCustomContent', () => {
  it('does not invoke footerRender when render replaces the full modal', () => {
    const footerRender = vi.fn(() => 'footer');
    const render = vi.fn(() => 'modal');

    expect(
      resolveModalCustomContent(
        { content: 'content', footerRender, render },
        { ...footerProps, close: vi.fn(async () => undefined) },
      ),
    ).toEqual({ kind: 'modal', node: 'modal' });
    expect(render).toHaveBeenCalledOnce();
    expect(footerRender).not.toHaveBeenCalled();
  });

  it('uses footerRender when the full render is absent', () => {
    const footerRender = vi.fn(() => null);

    expect(
      resolveModalCustomContent(
        { content: 'content', footerRender },
        { ...footerProps, close: vi.fn(async () => undefined) },
      ),
    ).toEqual({ kind: 'footer', node: null });
    expect(footerRender).toHaveBeenCalledWith(footerProps);
  });
});
