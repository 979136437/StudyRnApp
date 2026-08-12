import type { ReactNode } from 'react';

import type {
  ModalFooterRenderProps,
  ModalOptions,
  ModalRenderProps,
} from './types';

type ModalCustomContent =
  | { kind: 'footer'; node: ReactNode }
  | { kind: 'modal'; node: ReactNode };

export function resolveModalCustomContent(
  options: ModalOptions,
  props: ModalFooterRenderProps & Pick<ModalRenderProps, 'close'>,
): ModalCustomContent {
  if (options.render !== undefined) {
    return {
      kind: 'modal',
      node: options.render({
        ...props,
        content: options.content,
        showCancel: options.showCancel ?? true,
        title: options.title,
      }),
    };
  }

  const { close: _, ...footerProps } = props;
  return {
    kind: 'footer',
    node: options.footerRender?.(footerProps),
  };
}
