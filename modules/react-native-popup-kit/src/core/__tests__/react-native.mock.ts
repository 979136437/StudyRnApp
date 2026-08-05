let hardwareBackHandler: (() => boolean) | null = null;

export const BackHandler = {
  addEventListener: (_event: 'hardwareBackPress', handler: () => boolean) => {
    hardwareBackHandler = handler;
    return {
      remove: () => {
        if (hardwareBackHandler === handler) hardwareBackHandler = null;
      },
    };
  },
};

export function triggerHardwareBack(): boolean {
  return hardwareBackHandler?.() ?? false;
}
