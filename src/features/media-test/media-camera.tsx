import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MediaType } from 'react-native-media-kit';
import {
  Camera,
  type Recorder,
  useCameraPermission,
  useMicrophonePermission,
  usePhotoOutput,
  useVideoOutput,
} from 'react-native-vision-camera';

interface MediaCameraProps {
  visible: boolean;
  type: MediaType;
  onCapture: (uri: string, type: MediaType) => void;
  onClose: () => void;
}

const fileUri = (path: string) =>
  path.startsWith('file://') ? path : `file://${path}`;

export function MediaCamera({
  visible,
  type,
  onCapture,
  onClose,
}: MediaCameraProps) {
  const cameraPermission = useCameraPermission();
  const microphonePermission = useMicrophonePermission();
  const [position, setPosition] = useState<'front' | 'back'>('back');
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string>();
  const recorder = useRef<Recorder | undefined>(undefined);
  const photoOutput = usePhotoOutput();
  const videoOutput = useVideoOutput({ enableAudio: type === 'video' });
  const outputs = useMemo(
    () => (type === 'image' ? [photoOutput] : [videoOutput]),
    [photoOutput, type, videoOutput],
  );

  useEffect(() => {
    if (!visible) return;
    if (
      !cameraPermission.hasPermission &&
      cameraPermission.canRequestPermission
    ) {
      void cameraPermission.requestPermission();
    }
    if (
      type === 'video' &&
      !microphonePermission.hasPermission &&
      microphonePermission.canRequestPermission
    ) {
      void microphonePermission.requestPermission();
    }
  }, [cameraPermission, microphonePermission, type, visible]);

  useEffect(
    () => () => {
      if (recorder.current?.isRecording)
        void recorder.current.cancelRecording();
    },
    [],
  );

  const capture = async () => {
    setError(undefined);
    try {
      if (type === 'image') {
        const photo = await photoOutput.capturePhotoToFile({}, {});
        onCapture(fileUri(photo.filePath), 'image');
        return;
      }
      if (recorder.current?.isRecording) {
        await recorder.current.stopRecording();
        return;
      }
      recorder.current = await videoOutput.createRecorder({ maxDuration: 60 });
      setRecording(true);
      await recorder.current.startRecording(
        (path) => {
          setRecording(false);
          onCapture(fileUri(path), 'video');
        },
        (reason) => {
          setRecording(false);
          setError(reason.message);
        },
      );
    } catch (reason) {
      setRecording(false);
      setError(reason instanceof Error ? reason.message : '拍摄失败');
    }
  };

  const permitted =
    cameraPermission.hasPermission &&
    (type === 'image' || microphonePermission.hasPermission);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        {permitted ? (
          <Camera
            style={StyleSheet.absoluteFill}
            isActive={visible}
            device={position}
            outputs={outputs}
          />
        ) : (
          <View style={styles.permission}>
            <Text style={styles.message}>需要相机及录音权限</Text>
          </View>
        )}
        <View style={styles.top}>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.iconButton}
          >
            <Text style={styles.icon}>×</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="切换相机"
            onPress={() =>
              setPosition((value) => (value === 'back' ? 'front' : 'back'))
            }
            style={styles.iconButton}
          >
            <Text style={styles.icon}>↻</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={type === 'video' ? '录制视频' : '拍照'}
            disabled={!permitted}
            onPress={capture}
            style={[styles.shutter, recording && styles.recording]}
          />
          <View style={styles.iconButton}>
            <Text style={styles.mode}>
              {type === 'image' ? '照片' : '视频'}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  message: { color: '#fff', fontSize: 16 },
  top: {
    position: 'absolute',
    top: 48,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  error: { flex: 1, color: '#fff', textAlign: 'center' },
  controls: {
    position: 'absolute',
    bottom: 48,
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { color: '#fff', fontSize: 34 },
  mode: { color: '#fff', fontSize: 13 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    borderWidth: 5,
    borderColor: '#9ca3af',
  },
  recording: { backgroundColor: '#dc2626' },
});
