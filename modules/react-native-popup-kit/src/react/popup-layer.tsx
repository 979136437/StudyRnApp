import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

import { POPUP_ANIMATION_DURATION } from '../core/constants';
import { type ManagedPopup, PopupController } from '../core/controller';
import type {
  ClosePopupResult,
  PopupPlacement,
  PopupRenderContext,
} from '../types';
import { DefaultLoading } from './default-loading';
import { DefaultModal } from './default-modal';
import { DefaultPopup } from './default-popup';
import { DefaultToast } from './default-toast';
import { DEFAULT_POPUP_APPEARANCE } from './defaults';
import { styles } from './styles';

interface PopupLayerProps {
  controller: PopupController;
  insets: EdgeInsets;
  instance: ManagedPopup;
}

function placementStyle(
  placement: PopupPlacement,
  insets: EdgeInsets,
  useSafeArea: boolean,
): StyleProp<ViewStyle> {
  const safeInsets = useSafeArea
    ? insets
    : { top: 0, right: 0, bottom: 0, left: 0 };
  switch (placement) {
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

function transformForPlacement(
  progress: Animated.Value,
  placement: PopupPlacement,
): Animated.WithAnimatedArray<
  | { scale: Animated.AnimatedInterpolation<number> }
  | { translateX: Animated.AnimatedInterpolation<number> }
  | { translateY: Animated.AnimatedInterpolation<number> }
> {
  if (placement === 'left' || placement === 'right') {
    return [
      {
        translateX: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [placement === 'left' ? -24 : 24, 0],
        }),
      },
    ];
  }
  if (placement === 'top' || placement === 'bottom') {
    return [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [placement === 'top' ? -24 : 24, 0],
        }),
      },
    ];
  }
  return [
    {
      scale: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.96, 1],
      }),
    },
  ];
}

function popupPlacement(instance: ManagedPopup): PopupPlacement {
  return instance.kind === 'popup' ? instance.placement : 'center';
}

function animatedContainerStyle(placement: PopupPlacement): ViewStyle {
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
  const [progress] = useState(() => new Animated.Value(0));
  const placement = popupPlacement(instance);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      duration: POPUP_ANIMATION_DURATION,
      easing: instance.closing
        ? Easing.in(Easing.cubic)
        : Easing.out(Easing.cubic),
      toValue: instance.closing ? 0 : 1,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && instance.closing) controller.completeClose(instance.id);
    });
    return () => animation.stop();
  }, [controller, instance.closing, instance.id, progress]);

  const useSafeArea =
    instance.kind === 'popup' ? (instance.options.useSafeArea ?? true) : true;
  const closeOnMask =
    instance.kind === 'popup' && (instance.options.closeOnMaskPress ?? true);

  return (
    <Animated.View
      pointerEvents={instance.mask ? 'auto' : 'box-none'}
      style={[styles.layer, { opacity: progress, zIndex: instance.order }]}
    >
      {instance.mask ? (
        <Pressable
          accessibilityLabel={closeOnMask ? '关闭弹窗' : undefined}
          disabled={!closeOnMask}
          onPress={() => void controller.close(instance.id, 'overlay')}
          style={[
            styles.mask,
            { backgroundColor: DEFAULT_POPUP_APPEARANCE.maskColor },
          ]}
        />
      ) : null}
      <View
        pointerEvents="box-none"
        style={[
          styles.placement,
          placementStyle(placement, insets, useSafeArea),
        ]}
      >
        <Animated.View
          style={[
            animatedContainerStyle(placement),
            { transform: transformForPlacement(progress, placement) },
          ]}
        >
          <PopupContent controller={controller} instance={instance} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}
