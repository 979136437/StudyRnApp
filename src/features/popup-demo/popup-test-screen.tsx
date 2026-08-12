import { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  PopupDisplayMode,
  PopupMode,
  PopupProvider,
  hidePopup,
  showPopup,
  usePopup,
  type PopupDisplayMode as PopupDisplayModeValue,
  type PopupMode as PopupModeValue,
  type PopupOptions,
} from 'react-native-popup-kit';
import { useSharedValue } from 'react-native-reanimated';

import { DemoButton } from './demo-button';
import { PopupTestContent } from './popup-test-content';
import { testStyles as styles } from './popup-test-styles';

const MODES: readonly PopupModeValue[] = [
  PopupMode.BOTTOM,
  PopupMode.TOP,
  PopupMode.CENTER,
  PopupMode.LEFT,
  PopupMode.RIGHT,
  PopupMode.FULLSCREEN,
];
const DISPLAY_MODES: readonly PopupDisplayModeValue[] = [
  PopupDisplayMode.QUEUE,
  PopupDisplayMode.STACK,
];
const POPUP_COLORS: readonly (string | undefined)[] = [
  undefined,
  '#FFFFFF',
  '#E8F3EF',
  '#FFF1D6',
  '#EAF0FF',
];
const OVERLAY_COLORS: readonly (string | undefined)[] = [
  undefined,
  'rgba(0, 0, 0, 0.25)',
  'rgba(8, 126, 91, 0.35)',
  'rgba(23, 33, 43, 0.7)',
];

function describeError(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : '未知错误';
}

function PopupConsole({
  unmountLocal,
}: {
  unmountLocal: () => void;
}): React.JSX.Element {
  const localController = usePopup();
  const progress = useSharedValue(0);
  const sequence = useRef(0);
  const [mode, setMode] = useState<PopupModeValue>(PopupMode.CENTER);
  const [displayMode, setDisplayMode] = useState<PopupDisplayModeValue>(
    PopupDisplayMode.QUEUE,
  );
  const [customId, setCustomId] = useState('');
  const [duration, setDuration] = useState('300');
  const [popupColor, setPopupColor] = useState<string>();
  const [overlayColor, setOverlayColor] = useState<string>();
  const [overlay, setOverlay] = useState(true);
  const [closeOnOverlay, setCloseOnOverlay] = useState(true);
  const [customOverlayContent, setCustomOverlayContent] = useState(false);
  const [shareValue, setShareValue] = useState(false);
  const [activeId, setActiveId] = useState<string>();
  const [queuedIds, setQueuedIds] = useState<readonly string[]>([]);
  const [status, setStatus] = useState('等待测试');

  const openGlobal = async (
    overrides: Partial<PopupOptions> = {},
  ): Promise<string | null> => {
    const globalId = { current: overrides.id ?? customId.trim() };
    const parsedDuration = Number(duration);
    const selectedDisplayMode = overrides.displayMode ?? displayMode;
    const selectedMode = overrides.mode ?? mode;
    const selectedOverlay = overrides.overlay ?? overlay;
    const selectedPopupStyle =
      overrides.popupStyle ??
      (popupColor === undefined ? undefined : { backgroundColor: popupColor });
    const selectedOverlayStyle =
      overrides.overlayStyle ??
      (overlayColor === undefined
        ? undefined
        : { backgroundColor: overlayColor });
    try {
      const id = await showPopup({
        closeOnClickOverlay: closeOnOverlay,
        displayMode: selectedDisplayMode,
        duration: Number.isFinite(parsedDuration) ? parsedDuration : undefined,
        id: globalId.current || undefined,
        mode: selectedMode,
        overlay: selectedOverlay,
        overlayContent: customOverlayContent ? (
          <View
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderColor: 'rgba(255, 255, 255, 0.2)',
              borderWidth: 12,
              flex: 1,
            }}
          />
        ) : undefined,
        overlayStyle: selectedOverlayStyle,
        popupStyle: selectedPopupStyle,
        shareValue: shareValue ? progress : undefined,
        ...overrides,
        children: (
          <PopupTestContent
            displayMode={selectedDisplayMode}
            globalId={globalId}
            localController={localController}
            mode={selectedMode}
            overlay={selectedOverlay}
            overlayColor={overlayColor}
            popupColor={popupColor}
            progress={shareValue ? progress : undefined}
            report={setStatus}
          />
        ),
      });
      globalId.current = id;
      setActiveId(id);
      setStatus(`全局 showPopup 返回：${id}`);
      return id;
    } catch (error) {
      setStatus(`调用被拒绝：${describeError(error)}`);
      return null;
    }
  };

  const enqueueModes = async (
    modes: readonly PopupModeValue[],
    label: string,
  ): Promise<void> => {
    sequence.current += 1;
    const ids: string[] = [];
    for (const [index, itemMode] of modes.entries()) {
      const id = await openGlobal({
        displayMode: PopupDisplayMode.QUEUE,
        id: `${label}-${sequence.current}-${index + 1}`,
        mode: itemMode,
      });
      if (id !== null) ids.push(id);
    }
    setQueuedIds(ids);
    setStatus(`${label} 已按 FIFO 入队：${ids.join(' → ')}`);
  };

  const testDuplicate = async (): Promise<void> => {
    sequence.current += 1;
    const id = `duplicate-${sequence.current}`;
    await openGlobal({ id });
    await openGlobal({ id });
  };

  const openStackSeries = async (): Promise<void> => {
    sequence.current += 1;
    const ids: string[] = [];
    for (const [index, itemMode] of (
      [PopupMode.BOTTOM, PopupMode.CENTER, PopupMode.RIGHT] as const
    ).entries()) {
      const id = await openGlobal({
        displayMode: PopupDisplayMode.STACK,
        id: `stack-${sequence.current}-${index + 1}`,
        mode: itemMode,
        shareValue: undefined,
      });
      if (id !== null) ids.push(id);
    }
    setQueuedIds(ids);
    setStatus(`stack 层级（底 → 顶）：${ids.join(' → ')}`);
  };

  const openMixedLayers = async (): Promise<void> => {
    sequence.current += 1;
    const queueId = await openGlobal({
      displayMode: PopupDisplayMode.QUEUE,
      id: `mixed-queue-${sequence.current}`,
      mode: PopupMode.CENTER,
      shareValue: undefined,
    });
    const stackId = await openGlobal({
      displayMode: PopupDisplayMode.STACK,
      id: `mixed-stack-${sequence.current}`,
      mode: PopupMode.BOTTOM,
      shareValue: undefined,
    });
    const ids = [queueId, stackId].filter((id): id is string => id !== null);
    setQueuedIds(ids);
    setStatus(`混合展示：queue ${queueId}，stack ${stackId}`);
  };

  const advanceQueueUnderStack = async (): Promise<void> => {
    sequence.current += 1;
    const currentQueueId = `advance-queue-1-${sequence.current}`;
    const nextQueueId = `advance-queue-2-${sequence.current}`;
    const stackId = `advance-stack-${sequence.current}`;
    await openGlobal({
      displayMode: PopupDisplayMode.QUEUE,
      id: currentQueueId,
      shareValue: undefined,
    });
    await openGlobal({
      displayMode: PopupDisplayMode.QUEUE,
      id: nextQueueId,
      shareValue: undefined,
    });
    await openGlobal({
      displayMode: PopupDisplayMode.STACK,
      id: stackId,
      shareValue: undefined,
    });
    await hidePopup(currentQueueId);
    setQueuedIds([nextQueueId, stackId]);
    setStatus(`stack ${stackId} 下已推进到 queue ${nextQueueId}`);
  };

  const closeNonTopStack = async (): Promise<void> => {
    if (queuedIds.length < 2) {
      setStatus('请先运行“连续 stack”测试');
      return;
    }
    await hidePopup(queuedIds[0] ?? '');
    setStatus(`已关闭非顶层 stack：${queuedIds[0]}`);
  };

  const openCrossScopeStacks = async (): Promise<void> => {
    const globalId = await openGlobal({
      displayMode: PopupDisplayMode.STACK,
      id: `global-stack-${sequence.current + 1}`,
    });
    sequence.current += 1;
    const localId = { current: `local-stack-${sequence.current}` };
    await localController.showPopup({
      children: (
        <View style={styles.popup}>
          <Text selectable style={styles.popupTitle}>
            局部 stack 顶层
          </Text>
          <Text selectable style={styles.popupMeta}>
            该层晚于全局 stack 调用，应位于最上层。
          </Text>
          <DemoButton
            label="关闭局部 stack"
            onPress={() => void localController.hidePopup(localId.current)}
            primary
          />
        </View>
      ),
      displayMode: PopupDisplayMode.STACK,
      id: localId.current,
      popupStyle: { backgroundColor: '#FFFFFF' },
    });
    setStatus(`跨作用域层级：${globalId} → ${localId.current}`);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
    >
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text selectable style={styles.sectionTitle}>
            最近结果
          </Text>
          <Text selectable style={styles.sectionMeta}>
            API 状态
          </Text>
        </View>
        <Text selectable style={styles.status}>
          {status}
        </Text>
      </View>

      <View style={styles.section}>
        <Text selectable style={styles.sectionTitle}>
          displayMode
        </Text>
        <View style={styles.actions}>
          {DISPLAY_MODES.map((item) => (
            <Pressable
              key={item}
              onPress={() => setDisplayMode(item)}
              style={[
                styles.modeButton,
                displayMode === item && styles.modeSelected,
              ]}
            >
              <Text
                style={[
                  styles.modeText,
                  displayMode === item && styles.modeTextSelected,
                ]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text selectable style={styles.sectionTitle}>
          mode
        </Text>
        <View style={styles.actions}>
          {MODES.map((item) => (
            <Pressable
              key={item}
              onPress={() => setMode(item)}
              style={[styles.modeButton, mode === item && styles.modeSelected]}
            >
              <Text
                style={[
                  styles.modeText,
                  mode === item && styles.modeTextSelected,
                ]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text selectable style={styles.sectionTitle}>
          PopupOptions
        </Text>
        <View style={styles.field}>
          <Text selectable style={styles.fieldLabel}>
            id（留空自动生成）
          </Text>
          <TextInput
            autoCapitalize="none"
            onChangeText={setCustomId}
            placeholder="custom-popup-id"
            style={styles.input}
            value={customId}
          />
        </View>
        <View style={styles.field}>
          <Text selectable style={styles.fieldLabel}>
            duration（毫秒）
          </Text>
          <TextInput
            keyboardType="number-pad"
            onChangeText={setDuration}
            style={styles.input}
            value={duration}
          />
        </View>
        <View style={styles.field}>
          <Text selectable style={styles.fieldLabel}>
            popupStyle.backgroundColor（首项为未设置）
          </Text>
          <View style={styles.actions}>
            {POPUP_COLORS.map((color, index) => (
              <Pressable
                accessibilityLabel={color ?? '不设置背景色'}
                key={color ?? 'default'}
                onPress={() => setPopupColor(color)}
                style={[
                  styles.colorButton,
                  { backgroundColor: color ?? 'transparent' },
                  popupColor === color && styles.colorSelected,
                ]}
              >
                {index === 0 ? <Text style={styles.modeText}>默认</Text> : null}
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.field}>
          <Text selectable style={styles.fieldLabel}>
            overlayStyle.backgroundColor（首项为默认遮罩）
          </Text>
          <View style={styles.actions}>
            {OVERLAY_COLORS.map((color, index) => (
              <Pressable
                accessibilityLabel={color ?? '使用默认遮罩颜色'}
                key={color ?? 'default-overlay'}
                onPress={() => setOverlayColor(color)}
                style={[
                  styles.colorButton,
                  { backgroundColor: color ?? 'transparent' },
                  overlayColor === color && styles.colorSelected,
                ]}
              >
                {index === 0 ? <Text style={styles.modeText}>默认</Text> : null}
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.switchRow}>
          <Text selectable style={styles.switchText}>
            overlay
          </Text>
          <Switch onValueChange={setOverlay} value={overlay} />
        </View>
        <View style={styles.switchRow}>
          <Text selectable style={styles.switchText}>
            closeOnClickOverlay
          </Text>
          <Switch onValueChange={setCloseOnOverlay} value={closeOnOverlay} />
        </View>
        <View style={styles.switchRow}>
          <Text selectable style={styles.switchText}>
            overlayContent
          </Text>
          <Switch
            onValueChange={setCustomOverlayContent}
            value={customOverlayContent}
          />
        </View>
        <View style={styles.switchRow}>
          <Text selectable style={styles.switchText}>
            shareValue
          </Text>
          <Switch onValueChange={setShareValue} value={shareValue} />
        </View>
      </View>

      <View style={styles.section}>
        <Text selectable style={styles.sectionTitle}>
          全局 API
        </Text>
        <View style={styles.actions}>
          <DemoButton
            label="显示弹窗"
            onPress={() => void openGlobal()}
            primary
          />
          <DemoButton
            disabled={activeId === undefined}
            label="隐藏当前"
            onPress={() =>
              activeId &&
              void hidePopup(activeId).then(() =>
                setStatus(`已隐藏：${activeId}`),
              )
            }
          />
          <DemoButton
            label="隐藏未知 id"
            onPress={() =>
              void hidePopup('missing-popup-id').then(() =>
                setStatus('未知 id 幂等成功'),
              )
            }
          />
          <DemoButton label="重复 id" onPress={() => void testDuplicate()} />
        </View>
      </View>

      <View style={styles.section}>
        <Text selectable style={styles.sectionTitle}>
          队列与边界
        </Text>
        <View style={styles.actions}>
          <DemoButton
            label="三项 FIFO"
            onPress={() =>
              void enqueueModes(
                [PopupMode.BOTTOM, PopupMode.CENTER, PopupMode.RIGHT],
                PopupDisplayMode.QUEUE,
              )
            }
          />
          <DemoButton
            label="连续 stack"
            onPress={() => void openStackSeries()}
          />
          <DemoButton
            label="queue + stack"
            onPress={() => void openMixedLayers()}
          />
          <DemoButton
            label="stack 下推进 queue"
            onPress={() => void advanceQueueUnderStack()}
          />
          <DemoButton
            label="关闭非顶层 stack"
            onPress={() => void closeNonTopStack()}
          />
          <DemoButton
            label="跨全局/局部 stack"
            onPress={() => void openCrossScopeStacks()}
          />
          <DemoButton
            label="遍历六种模式"
            onPress={() => void enqueueModes(MODES, 'mode')}
          />
          <DemoButton
            disabled={queuedIds.length < 2}
            label="取消排队项"
            onPress={() =>
              void hidePopup(queuedIds[1] ?? '').then(() =>
                setStatus(`已取消排队项：${queuedIds[1]}`),
              )
            }
          />
          <DemoButton
            label="默认参数"
            onPress={() =>
              void openGlobal({
                closeOnClickOverlay: undefined,
                displayMode: undefined,
                duration: undefined,
                id: undefined,
                mode: undefined,
                overlay: undefined,
              })
            }
          />
          <DemoButton
            label="duration = 0"
            onPress={() => void openGlobal({ duration: 0 })}
          />
          <DemoButton
            label="无遮罩"
            onPress={() => void openGlobal({ overlay: false })}
          />
          <DemoButton
            label="遮罩不可关闭"
            onPress={() => void openGlobal({ closeOnClickOverlay: false })}
          />
          <DemoButton label="卸载局部 Provider" onPress={unmountLocal} />
        </View>
      </View>
    </ScrollView>
  );
}

export function PopupDemoScreen(): React.JSX.Element {
  const [localMounted, setLocalMounted] = useState(true);
  if (!localMounted) {
    return (
      <View style={[styles.screen, styles.popup]}>
        <Text selectable style={styles.popupTitle}>
          局部 PopupProvider 已卸载
        </Text>
        <Text selectable style={styles.popupMeta}>
          局部队列已清空，等待中的隐藏任务已完成。
        </Text>
        <DemoButton
          label="重新挂载测试页"
          onPress={() => setLocalMounted(true)}
          primary
        />
      </View>
    );
  }
  return (
    <PopupProvider>
      <PopupConsole unmountLocal={() => setLocalMounted(false)} />
    </PopupProvider>
  );
}
