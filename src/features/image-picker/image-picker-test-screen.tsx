import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  MediaPickerModal,
  NitroImagePickerError,
  clearCacheAsync,
  getCameraPermissionsAsync,
  getMediaLibraryPermissionsAsync,
  getMicrophonePermissionsAsync,
  getPendingResultAsync,
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
  requestMicrophonePermissionsAsync,
  type ImagePickerResult,
  type MediaPermissionResponse,
} from 'react-native-nitro-image-picker';

import { ActionButton } from './action-button';
import { imagePickerColors } from './colors';
import { CustomMediaPickerModal } from './custom-media-picker-modal';
import { PermissionRow } from './permission-row';
import { PickerResultPanel } from './picker-result-panel';

type PermissionKind = 'media' | 'camera' | 'microphone';

interface PermissionState {
  camera?: MediaPermissionResponse;
  media?: MediaPermissionResponse;
  microphone?: MediaPermissionResponse;
}

function errorMessage(error: unknown): string {
  if (error instanceof NitroImagePickerError)
    return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

export function ImagePickerTestScreen(): React.JSX.Element {
  const [permissions, setPermissions] = useState<PermissionState>({});
  const [busyAction, setBusyAction] = useState<string>();
  const [message, setMessage] = useState('等待操作');
  const [result, setResult] = useState<ImagePickerResult>();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [customPickerVisible, setCustomPickerVisible] = useState(false);

  const refreshPermissions = useCallback(async (): Promise<void> => {
    const [media, camera, microphone] = await Promise.all([
      getMediaLibraryPermissionsAsync(['images', 'videos']),
      getCameraPermissionsAsync(),
      getMicrophonePermissionsAsync(),
    ]);
    setPermissions({ camera, media, microphone });
  }, []);

  useEffect(() => {
    void refreshPermissions().catch((error: unknown) => {
      setMessage(errorMessage(error));
    });
  }, [refreshPermissions]);

  const runAction = useCallback(
    async (name: string, action: () => Promise<void>): Promise<void> => {
      if (busyAction) return;
      setBusyAction(name);
      setMessage(`${name}执行中`);
      try {
        await action();
      } catch (error) {
        setMessage(errorMessage(error));
      } finally {
        setBusyAction(undefined);
      }
    },
    [busyAction],
  );

  const requestPermission = useCallback(
    (kind: PermissionKind): void => {
      void runAction(`请求${kind}权限`, async () => {
        const response =
          kind === 'media'
            ? await requestMediaLibraryPermissionsAsync(['images', 'videos'])
            : kind === 'camera'
              ? await requestCameraPermissionsAsync()
              : await requestMicrophonePermissionsAsync();
        setPermissions((current) => ({ ...current, [kind]: response }));
        setMessage(response.granted ? '权限已授予' : '权限未授予');
      });
    },
    [runAction],
  );

  const storeResult = useCallback(
    (nextResult: ImagePickerResult, source: string): void => {
      setResult(nextResult);
      setMessage(
        nextResult.canceled
          ? `${source}已取消`
          : `${source}返回 ${nextResult.assets.length} 项`,
      );
    },
    [],
  );

  const openSystemLibrary = useCallback(
    (multiple: boolean): void => {
      const name = multiple ? '系统多选' : '系统单选';
      void runAction(name, async () => {
        const nextResult = await launchImageLibraryAsync({
          allowsMultipleSelection: multiple,
          mediaTypes: ['images', 'videos'],
          orderedSelection: multiple,
          selectionLimit: multiple ? 9 : 1,
          shouldDownloadFromNetwork: true,
        });
        storeResult(nextResult, name);
      });
    },
    [runAction, storeResult],
  );

  const openCamera = useCallback(
    (mediaType: 'image' | 'video'): void => {
      const name = mediaType === 'image' ? '拍照' : '录像';
      void runAction(name, async () => {
        const cameraPermission = await requestCameraPermissionsAsync();
        setPermissions((current) => ({ ...current, camera: cameraPermission }));
        if (!cameraPermission.granted) {
          throw new NitroImagePickerError(
            'E_PERMISSION_DENIED',
            '没有相机权限',
          );
        }
        if (mediaType === 'video') {
          const microphonePermission =
            await requestMicrophonePermissionsAsync();
          setPermissions((current) => ({
            ...current,
            microphone: microphonePermission,
          }));
          if (!microphonePermission.granted) {
            throw new NitroImagePickerError(
              'E_PERMISSION_DENIED',
              '录像需要麦克风权限',
            );
          }
        }
        const nextResult = await launchCameraAsync({
          mediaType,
          videoMaxDuration: 15,
        });
        storeResult(nextResult, name);
      });
    },
    [runAction, storeResult],
  );

  const recoverPendingResult = useCallback((): void => {
    void runAction('恢复 pending result', async () => {
      const pending = await getPendingResultAsync();
      if (!pending) {
        setMessage('没有待恢复结果');
        return;
      }
      if ('code' in pending) {
        setMessage(`${pending.code}: ${pending.message}`);
        return;
      }
      storeResult(pending, 'pending result');
    });
  }, [runAction, storeResult]);

  const clearCache = useCallback((): void => {
    void runAction('清理模块缓存', async () => {
      await clearCacheAsync();
      setResult(undefined);
      setMessage('模块缓存已清理，结果预览已重置');
    });
  }, [runAction]);

  const closeDefaultPicker = useCallback(() => setPickerVisible(false), []);
  const closeCustomPicker = useCallback(
    () => setCustomPickerVisible(false),
    [],
  );
  const handleDefaultPickerComplete = useCallback(
    (nextResult: ImagePickerResult) => {
      setPickerVisible(false);
      storeResult(nextResult, '默认选择器');
    },
    [storeResult],
  );
  const handleCustomPickerComplete = useCallback(
    (nextResult: ImagePickerResult) => {
      setCustomPickerVisible(false);
      storeResult(nextResult, '自定义 UI');
    },
    [storeResult],
  );
  const handleDefaultPickerError = useCallback(
    (error: NitroImagePickerError) =>
      setMessage(`${error.code}: ${error.message}`),
    [],
  );

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        style={styles.screen}
      >
        <View style={styles.section}>
          <Text selectable style={styles.sectionTitle}>
            界面示例
          </Text>
          <Text selectable style={styles.sectionDescription}>
            默认界面验证完整选择流程；自定义 UI 展示无头
            API、分页和独立视觉实现。
          </Text>
          <View style={styles.actions}>
            <ActionButton
              label="打开默认选择器"
              onPress={() => setPickerVisible(true)}
              tone="primary"
            />
            <ActionButton
              label="打开自定义 UI"
              onPress={() => setCustomPickerVisible(true)}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text selectable style={styles.sectionTitle}>
            系统入口
          </Text>
          <Text selectable style={styles.sectionDescription}>
            分别验证系统相册单选、多选以及系统相机的取消和成功结果。
          </Text>
          <View style={styles.actions}>
            <ActionButton
              busy={busyAction === '系统单选'}
              disabled={Boolean(busyAction)}
              label="系统单选"
              onPress={() => openSystemLibrary(false)}
            />
            <ActionButton
              busy={busyAction === '系统多选'}
              disabled={Boolean(busyAction)}
              label="系统多选"
              onPress={() => openSystemLibrary(true)}
            />
            <ActionButton
              busy={busyAction === '拍照'}
              disabled={Boolean(busyAction)}
              label="拍照"
              onPress={() => openCamera('image')}
            />
            <ActionButton
              busy={busyAction === '录像'}
              disabled={Boolean(busyAction)}
              label="录像 15 秒"
              onPress={() => openCamera('video')}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeadingRow}>
            <View style={styles.sectionCopy}>
              <Text selectable style={styles.sectionTitle}>
                权限状态
              </Text>
              <Text selectable style={styles.sectionDescription}>
                状态读取不会触发系统授权弹窗。
              </Text>
            </View>
            <View style={styles.compactAction}>
              <ActionButton
                busy={busyAction === '刷新权限'}
                disabled={Boolean(busyAction)}
                label="刷新"
                onPress={() =>
                  void runAction('刷新权限', async () => {
                    await refreshPermissions();
                    setMessage('权限状态已刷新');
                  })
                }
              />
            </View>
          </View>
          <PermissionRow
            busy={busyAction === '请求media权限'}
            onRequest={() => requestPermission('media')}
            permission={permissions.media}
            requestLabel="请求访问"
            title="照片与视频"
          />
          <PermissionRow
            busy={busyAction === '请求camera权限'}
            onRequest={() => requestPermission('camera')}
            permission={permissions.camera}
            requestLabel="请求权限"
            title="相机"
          />
          <PermissionRow
            busy={busyAction === '请求microphone权限'}
            onRequest={() => requestPermission('microphone')}
            permission={permissions.microphone}
            requestLabel="请求权限"
            title="麦克风"
          />
          <View style={styles.actions}>
            <ActionButton
              label="打开系统设置"
              onPress={() => void Linking.openSettings()}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text selectable style={styles.sectionTitle}>
            恢复与缓存
          </Text>
          <View style={styles.actions}>
            <ActionButton
              busy={busyAction === '恢复 pending result'}
              disabled={Boolean(busyAction)}
              label="恢复 pending result"
              onPress={recoverPendingResult}
            />
            <ActionButton
              busy={busyAction === '清理模块缓存'}
              disabled={Boolean(busyAction)}
              label="清理模块缓存"
              onPress={clearCache}
              tone="danger"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text selectable style={styles.sectionTitle}>
            最近结果
          </Text>
          <Text selectable style={styles.status}>
            {message}
          </Text>
          <PickerResultPanel result={result} />
        </View>
      </ScrollView>

      <MediaPickerModal
        mediaTypes={['images', 'videos']}
        onCancel={closeDefaultPicker}
        onComplete={handleDefaultPickerComplete}
        onError={handleDefaultPickerError}
        selectionLimit={9}
        visible={pickerVisible}
      />
      <CustomMediaPickerModal
        onCancel={closeCustomPicker}
        onComplete={handleCustomPickerComplete}
        onError={setMessage}
        visible={customPickerVisible}
      />
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  compactAction: { width: 116 },
  content: { gap: 28, padding: 16, paddingBottom: 48 },
  screen: { backgroundColor: imagePickerColors.background },
  section: { gap: 12 },
  sectionCopy: { flex: 1, gap: 5 },
  sectionDescription: {
    color: imagePickerColors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionHeadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: imagePickerColors.text,
    fontSize: 19,
    fontWeight: '700',
  },
  status: {
    backgroundColor: imagePickerColors.surface,
    borderCurve: 'continuous',
    borderRadius: 6,
    color: imagePickerColors.text,
    fontSize: 13,
    lineHeight: 18,
    padding: 12,
  },
});
