import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  type ActivityIndicatorProps,
  type ImageSourcePropType,
  type ImageStyle,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import {
  RefreshHeader,
  RefreshLayout,
  RefreshState,
  useRefreshAnimation,
} from 'react-native-nitro-refresh';
import Animated, {
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RefreshHeaderBaseProps } from './refresh-header-types';
import {
  formatRefreshTime,
  isRefreshIndicatorVisible,
  labelForRefreshState,
} from './refresh-view-model';

const NORMAL_HEADER_HEIGHT = 80;
const ARROW_ANIMATION_DURATION_MS = 200;
const DEFAULT_INDICATOR_COLOR = '#808080';

const DEFAULT_ARROW_SOURCE =
  require('./assets/icon_down_arrow.png') as ImageSourcePropType;

export interface RefreshNormalHeaderProps extends RefreshHeaderBaseProps {
  arrowIcon?: ImageSourcePropType;
  activityIndicatorProps?: ActivityIndicatorProps;
  titleStyle?: TextStyle;
  timeStyle?: TextStyle;
  leftContainerStyle?: ViewStyle;
  rightContainerStyle?: ViewStyle;
  imageStyle?: ImageStyle;
}

type NormalHeaderContentProps = Omit<
  RefreshNormalHeaderProps,
  keyof RefreshHeaderBaseProps
>;

/**
 * 普通刷新头的可视内容。
 *
 * 箭头旋转直接读取 RefreshLayout 在界面线程维护的 stateValue；只有标题和最后更新
 * 时间跟随低频 React 状态变化，不会因连续拖动逐帧重渲染。
 */
function NormalHeaderContent({
  activityIndicatorProps,
  arrowIcon = DEFAULT_ARROW_SOURCE,
  imageStyle,
  leftContainerStyle,
  rightContainerStyle,
  timeStyle,
  titleStyle,
}: NormalHeaderContentProps): React.JSX.Element {
  const { state, stateValue } = useRefreshAnimation();
  const [lastRefreshTime, setLastRefreshTime] = useState(() =>
    formatRefreshTime(new Date()),
  );
  const arrowStyle = useAnimatedStyle(() => ({
    opacity: stateValue.value === RefreshState.Refreshing ? 0 : 1,
    transform: [
      {
        rotate: withTiming(
          stateValue.value === RefreshState.Pulling ||
            stateValue.value === RefreshState.Max
            ? '180deg'
            : '0deg',
          { duration: ARROW_ANIMATION_DURATION_MS },
        ),
      },
    ],
  }));

  useEffect(() => {
    if (state === RefreshState.Refreshing) {
      setLastRefreshTime(formatRefreshTime(new Date()));
    }
  }, [state]);

  return (
    <View
      className="w-full items-center justify-center flex-row gap-5 bg-red-500"
      style={[
        {
          height: NORMAL_HEADER_HEIGHT,
        },
      ]}
    >
      <View
        className="items-center justify-center bg-blue-500"
        style={[leftContainerStyle]}
      >
        <Animated.Image
          resizeMode="contain"
          source={arrowIcon}
          className="size-5 absolute"
          style={[imageStyle, arrowStyle]}
        />
        {isRefreshIndicatorVisible(state) ? (
          <ActivityIndicator
            color={DEFAULT_INDICATOR_COLOR}
            size="small"
            {...activityIndicatorProps}
          />
        ) : null}
      </View>
      <View
        className="items-center justify-center gap-1"
        style={[rightContainerStyle]}
      >
        <Text className="text-[#333] text-xl" style={[titleStyle]}>
          {labelForRefreshState(state)}
        </Text>
        <Text className="text-[#333] text-sm" style={[timeStyle]}>
          最后更新：{lastRefreshTime}
        </Text>
      </View>
    </View>
  );
}

/** 可直接传给 ScrollView、FlatList、SectionList 或 FlashList 的普通刷新头。 */
export function RefreshNormalHeader({
  children,
  containerStyle,
  enable,
  maxDistance,
  onChangeOffset,
  onMax,
  onRefresh,
  refreshing,
  ...contentProps
}: RefreshNormalHeaderProps): React.JSX.Element {
  const inset = useSafeAreaInsets();
  return (
    <RefreshLayout
      enable={enable}
      maxDistance={maxDistance}
      header={
        <RefreshHeader
          className="items-center justify-center pt-safe bg-blue-500"
          style={[containerStyle, { height: NORMAL_HEADER_HEIGHT + inset.top }]}
        >
          <NormalHeaderContent {...contentProps} />
        </RefreshHeader>
      }
      onChangeOffset={onChangeOffset}
      onMax={onMax}
      onRefreshing={onRefresh}
      refreshing={refreshing}
    >
      {children}
    </RefreshLayout>
  );
}
