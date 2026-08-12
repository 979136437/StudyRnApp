import type { MutableRefObject } from 'react';
import { Text, View } from 'react-native';
import {
  PopupMode,
  hidePopup,
  type PopupController,
  type PopupDisplayMode,
  type PopupMode as PopupModeValue,
} from 'react-native-popup-kit';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { DemoButton } from './demo-button';
import { testStyles as styles } from './popup-test-styles';

interface PopupTestContentProps {
  displayMode: PopupDisplayMode;
  globalId: MutableRefObject<string>;
  localController: PopupController;
  mode: PopupModeValue;
  overlay: boolean;
  overlayColor?: string;
  popupColor?: string;
  progress?: SharedValue<number>;
  report: (message: string) => void;
}

export function PopupTestContent({
  displayMode,
  globalId,
  localController,
  mode,
  overlay,
  overlayColor,
  popupColor,
  progress,
  report,
}: PopupTestContentProps): React.JSX.Element {
  const progressStyle = useAnimatedStyle(
    () => ({
      transform: [{ scaleX: progress?.value ?? 0 }],
    }),
    [progress],
  );

  const openLocalPopup = async (): Promise<void> => {
    const localId = { current: '' };
    localId.current = await localController.showPopup({
      children: (
        <View style={styles.popup}>
          <Text selectable style={styles.popupTitle}>
            局部 API 弹窗
          </Text>
          <Text selectable style={styles.popupMeta}>
            控制器来自测试页内无属性 PopupProvider。
          </Text>
          <DemoButton
            label="关闭局部弹窗"
            onPress={() => void localController.hidePopup(localId.current)}
            primary
          />
        </View>
      ),
      mode: PopupMode.CENTER,
      popupStyle: { backgroundColor: '#FFFFFF' },
    });
    report(`局部 showPopup 返回：${localId.current}`);
  };

  return (
    <View
      style={[
        styles.popup,
        mode === PopupMode.FULLSCREEN && styles.popupFullscreen,
      ]}
    >
      <Text selectable style={styles.popupTitle}>
        全局 API 弹窗
      </Text>
      <Text selectable style={styles.popupMeta}>
        id: {globalId.current || '自动生成'}
        {`\n`}displayMode: {displayMode} · mode: {mode}
        {`\n`}overlay: {String(overlay)}
        {`\n`}popupStyle.backgroundColor: {popupColor ?? '未设置'}
        {`\n`}overlayStyle.backgroundColor: {overlayColor ?? '未设置'}
      </Text>
      {progress === undefined ? null : (
        <View style={styles.field}>
          <Text selectable style={styles.fieldLabel}>
            SharedValue 进度 0 → 1 → 0
          </Text>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressValue, progressStyle]} />
          </View>
        </View>
      )}
      <View style={styles.actions}>
        <DemoButton
          label="关闭全局弹窗"
          onPress={() => void hidePopup(globalId.current)}
          primary
        />
        <DemoButton
          label="测试局部 API"
          onPress={() => void openLocalPopup()}
        />
      </View>
    </View>
  );
}
