import { useCallback, useEffect } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { POPUP_ANIMATION_DURATION } from '../core/constants';
import { type ManagedPopup, PopupController } from '../core/controller';
import type {
  ClosePopupResult,
  PopupId,
  PopupPlacement,
  PopupRenderContext,
} from '../types';
import { DefaultLoading } from './DefaultLoading';
import { DefaultModal } from './DefaultModal';
import { DefaultPopup } from './DefaultPopup';
import { DEFAULT_POPUP_APPEARANCE } from './defaults';
import { DefaultToast } from './DefaultToast';
import { styles } from './styles';

interface PopupLayerProps {
  controller: PopupController;
  insets: EdgeInsets;
  instance: ManagedPopup;
}

const POPUP_ENTER_OFFSET = 24;
const POPUP_ENTER_SCALE = 0.96;

function placementStyle(
  placement: PopupPlacement,
  insets: EdgeInsets,
  useSafeArea: boolean,
): StyleProp<ViewStyle> {
  const safeInsets = useSafeArea
    ? insets
    : { top: 0, right: 0, bottom: 0, left: 0 };
  switch (placement) {
    case 'fullscreen':
      return {
        alignItems: 'stretch',
        justifyContent: 'flex-start',
      };
    case 'top':
      return {
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        paddingTop: safeInsets.top,
        paddingLeft: safeInsets.left,
        paddingRight: safeInsets.right,
      };
    case 'bottom':
      return {
        alignItems: 'stretch',
        justifyContent: 'flex-end',
        paddingBottom: safeInsets.bottom,
        paddingLeft: safeInsets.left,
        paddingRight: safeInsets.right,
      };
    case 'left':
      return {
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: safeInsets.top,
        paddingBottom: safeInsets.bottom,
        paddingLeft: safeInsets.left,
      };
    case 'right':
      return {
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingTop: safeInsets.top,
        paddingRight: safeInsets.right,
        paddingBottom: safeInsets.bottom,
      };
    default:
      return {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: safeInsets.top + 20,
        paddingRight: safeInsets.right + 20,
        paddingBottom: safeInsets.bottom + 20,
        paddingLeft: safeInsets.left + 20,
      };
  }
}

function popupPlacement(instance: ManagedPopup): PopupPlacement {
  return instance.kind === 'popup' ? instance.placement : 'center';
}

function animatedContainerStyle(placement: PopupPlacement): ViewStyle {
  if (placement === 'fullscreen') {
    return { height: '100%', width: '100%' };
  }
  if (placement === 'left' || placement === 'right') {
    return { height: '100%', justifyContent: 'center' };
  }
  return {
    alignItems: placement === 'center' ? 'center' : 'stretch',
    width: '100%',
  };
}

function PopupContent({
  controller,
  instance,
}: Pick<PopupLayerProps, 'controller' | 'instance'>): React.JSX.Element {
  const close: PopupRenderContext['close'] = async () => {
    const closed = await controller.close(instance.id, 'api');
    return {
      id: instance.id,
      closed,
      kind: instance.kind,
      closeReason: 'api',
    } satisfies ClosePopupResult;
  };

  switch (instance.kind) {
    case 'toast': {
      const Component = instance.options.component ?? DefaultToast;
      return (
        <Component id={instance.id} options={instance.options} close={close} />
      );
    }
    case 'loading': {
      const Component = instance.options.component ?? DefaultLoading;
      return (
        <Component id={instance.id} options={instance.options} close={close} />
      );
    }
    case 'modal': {
      const Component = instance.options.component ?? DefaultModal;
      return (
        <Component
          id={instance.id}
          options={instance.options}
          value={instance.inputValue}
          close={close}
          onChangeText={(value) => controller.setModalInput(instance.id, value)}
          onConfirm={() => controller.respondModal(instance.id, true)}
          onCancel={() => controller.respondModal(instance.id, false)}
        />
      );
    }
    default: {
      const Component = instance.options.component ?? DefaultPopup;
      return (
        <Component id={instance.id} options={instance.options} close={close} />
      );
    }
  }
}

export function PopupLayer({
  controller,
  insets,
  instance,
}: PopupLayerProps): React.JSX.Element {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const placement = popupPlacement(instance);
  // ManagedPopup 持有生命周期 Promise，worklet 闭包只能捕获拆出的可序列化原始值。
  const instanceId = instance.id;
  const isClosing = instance.closing;
  const completeClose = useCallback(
    (id: PopupId) => controller.completeClose(id),
    [controller],
  );
  const layerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));
  const contentAnimatedStyle = useAnimatedStyle(() => {
    if (placement === 'fullscreen') return {};
    if (placement === 'left' || placement === 'right') {
      return {
        transform: [
          {
            translateX:
              (placement === 'left'
                ? -POPUP_ENTER_OFFSET
                : POPUP_ENTER_OFFSET) *
              (1 - progress.value),
          },
        ],
      };
    }
    if (placement === 'top' || placement === 'bottom') {
      return {
        transform: [
          {
            translateY:
              (placement === 'top' ? -POPUP_ENTER_OFFSET : POPUP_ENTER_OFFSET) *
              (1 - progress.value),
          },
        ],
      };
    }
    return {
      transform: [
        {
          scale: POPUP_ENTER_SCALE + progress.value * (1 - POPUP_ENTER_SCALE),
        },
      ],
    };
  }, [placement]);

  useEffect(() => {
    progress.value = withTiming(
      isClosing ? 0 : 1,
      {
        duration: reduceMotion ? 0 : POPUP_ANIMATION_DURATION,
        easing: isClosing ? Easing.in(Easing.cubic) : Easing.out(Easing.cubic),
      },
      (finished) => {
        if (finished && isClosing) {
          // 动画回调运行在 UI 线程，关闭收尾必须切回 RN 线程更新控制器状态。
          scheduleOnRN(completeClose, instanceId);
        }
      },
    );
    return () => cancelAnimation(progress);
  }, [completeClose, instanceId, isClosing, progress, reduceMotion]);

  const useSafeArea =
    instance.kind === 'popup' ? (instance.options.useSafeArea ?? true) : true;
  const closeOnMask =
    instance.kind === 'popup' && (instance.options.closeOnMaskPress ?? true);
  // mask 仅控制颜色；透明覆盖层仍需存在，确保任何弹窗都不会把事件传给页面。
  const overlayStyle = instance.mask
    ? [styles.mask, { backgroundColor: DEFAULT_POPUP_APPEARANCE.maskColor }]
    : styles.mask;

  return (
    <Animated.View
      accessibilityViewIsModal
      pointerEvents="auto"
      style={[styles.layer, { zIndex: instance.order }, layerAnimatedStyle]}
    >
      {closeOnMask ? (
        <Pressable
          accessibilityLabel="关闭弹窗"
          onPress={() => void controller.close(instance.id, 'overlay')}
          style={overlayStyle}
        />
      ) : (
        <View
          accessibilityElementsHidden
          pointerEvents="auto"
          style={overlayStyle}
        />
      )}
      <View
        pointerEvents="box-none"
        style={[
          styles.placement,
          placementStyle(placement, insets, useSafeArea),
        ]}
      >
        <Animated.View
          style={[animatedContainerStyle(placement), contentAnimatedStyle]}
        >
          <PopupContent controller={controller} instance={instance} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}
