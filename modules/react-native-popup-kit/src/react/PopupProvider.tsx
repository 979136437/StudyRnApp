import {
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

import { registerGlobalPopupController } from '../api/popup-api';
import { PopupHost } from '../components/PopupHost';
import { createPopupController } from '../core/popup-controller';
import type { PopupProviderProps } from '../types';
import { PopupContext, type PopupContextValue } from './popup-context';

export function PopupProvider({
  children,
}: PopupProviderProps): React.JSX.Element {
  const parentContext = use(PopupContext);
  const [controller] = useState(createPopupController);
  const [controllers, setControllers] = useState<
    readonly ReturnType<typeof createPopupController>[]
  >(() => [controller]);

  const registerController = useCallback(
    (
      nextController: ReturnType<typeof createPopupController>,
    ): (() => void) => {
      setControllers((current) =>
        current.includes(nextController)
          ? current
          : [...current, nextController],
      );
      return () => {
        setControllers((current) =>
          current.filter((item) => item !== nextController),
        );
      };
    },
    [],
  );

  const rootRegisterController =
    parentContext?.registerController ?? registerController;
  const contextValue = useMemo<PopupContextValue>(
    () => ({ controller, registerController: rootRegisterController }),
    [controller, rootRegisterController],
  );

  useLayoutEffect(() => {
    if (parentContext !== null) return;
    const unregister = registerGlobalPopupController(controller);
    return () => {
      unregister();
      controller.dispose();
    };
  }, [controller, parentContext]);

  useEffect(() => {
    if (parentContext === null) return;
    const unregister = parentContext.registerController(controller);
    return () => {
      unregister();
      controller.dispose();
    };
  }, [controller, parentContext]);

  return (
    <PopupContext value={contextValue}>
      {children}
      {parentContext === null ? <PopupHost controllers={controllers} /> : null}
    </PopupContext>
  );
}
