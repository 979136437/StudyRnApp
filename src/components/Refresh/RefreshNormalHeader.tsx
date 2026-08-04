import { useEffect, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  type ActivityIndicatorProps,
  type ImageSourcePropType,
  type ImageStyle,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import {
  RefreshHeader,
  RefreshLayout,
  RefreshState,
} from 'react-native-nitro-refresh';
import Animated, {
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { useRefreshAnimation } from '../../../modules/react-native-nitro-refresh/src/refresh-context';
import {
  formatRefreshTime,
  isRefreshIndicatorVisible,
  labelForRefreshState,
} from './refresh-view-model';

const NORMAL_HEADER_HEIGHT = 80;
const ARROW_ANIMATION_DURATION_MS = 200;
const ICON_SIZE = 30;
const COPY_WIDTH = 150;
const COPY_GAP = 10;
const TITLE_FONT_SIZE = 16;
const TIME_FONT_SIZE = 12;
const TIME_GAP = 6;
const DEFAULT_FOREGROUND_COLOR = '#333333';
const DEFAULT_INDICATOR_COLOR = '#808080';

const DEFAULT_ARROW_SOURCE =
  require('./assets/icon_down_arrow.png') as ImageSourcePropType;

export interface RefreshNormalHeaderProps {
  refreshing: boolean;
  onRefresh?: () => void;
  enable?: boolean;
  children?: ReactElement | null;
  arrowIcon?: ImageSourcePropType;
  activityIndicatorProps?: ActivityIndicatorProps;
  containerStyle?: ViewStyle;
  titleStyle?: TextStyle;
  timeStyle?: TextStyle;
  leftContainerStyle?: ViewStyle;
  rightContainerStyle?: ViewStyle;
  imageStyle?: ImageStyle;
}

type NormalHeaderContentProps = Omit<
  RefreshNormalHeaderProps,
  'children' | 'enable' | 'onRefresh' | 'refreshing' | 'containerStyle'
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
          stateValue.value === RefreshState.Pulling ? '180deg' : '0deg',
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
    <View style={styles.normalContent}>
      <View style={[styles.iconSlot, leftContainerStyle]}>
        <Animated.Image
          resizeMode="contain"
          source={arrowIcon}
          style={[styles.arrow, imageStyle, arrowStyle]}
        />
        {isRefreshIndicatorVisible(state) ? (
          <ActivityIndicator
            color={DEFAULT_INDICATOR_COLOR}
            size="small"
            {...activityIndicatorProps}
          />
        ) : null}
      </View>
      <View style={[styles.copy, rightContainerStyle]}>
        <Text style={[styles.title, titleStyle]}>
          {labelForRefreshState(state)}
        </Text>
        <Text style={[styles.time, timeStyle]}>
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
  onRefresh,
  refreshing,
  ...contentProps
}: RefreshNormalHeaderProps): React.JSX.Element {
  return (
    <RefreshLayout
      enable={enable}
      header={
        <RefreshHeader style={[styles.normalHeader, containerStyle]}>
          <NormalHeaderContent {...contentProps} />
        </RefreshHeader>
      }
      onRefreshing={onRefresh}
      refreshing={refreshing}
    >
      {children}
    </RefreshLayout>
  );
}

const styles = StyleSheet.create({
  arrow: {
    height: ICON_SIZE,
    position: 'absolute',
    tintColor: DEFAULT_INDICATOR_COLOR,
    width: ICON_SIZE,
  },
  copy: {
    alignItems: 'center',
    justifyContent: 'center',
    width: COPY_WIDTH,
  },
  iconSlot: {
    alignItems: 'center',
    height: ICON_SIZE,
    justifyContent: 'center',
    width: ICON_SIZE,
  },
  normalContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: COPY_GAP,
    justifyContent: 'center',
  },
  normalHeader: {
    alignItems: 'center',
    height: NORMAL_HEADER_HEIGHT,
    justifyContent: 'center',
  },
  time: {
    color: DEFAULT_FOREGROUND_COLOR,
    fontSize: TIME_FONT_SIZE,
    marginTop: TIME_GAP,
  },
  title: {
    color: DEFAULT_FOREGROUND_COLOR,
    fontSize: TITLE_FONT_SIZE,
  },
});
