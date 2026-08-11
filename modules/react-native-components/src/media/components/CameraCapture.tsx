import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  type Recorder,
  useCameraPermission,
  useMicrophonePermission,
  usePhotoOutput,
  useVideoOutput,
} from 'react-native-vision-camera';

import { cancelVideoCompression, readMediaFile } from '../core/compression';
import type {
  CameraPosition,
  ChooseMediaTempFile,
  MediaFileType,
} from '../types';

interface CameraCaptureProps {
  camera: CameraPosition;
  mediaType: MediaFileType[];
  maxDuration: number;
  onCaptured: (file: ChooseMediaTempFile) => void;
  onClose: () => void;
}

const toFileUri = (path: string) =>
  path.startsWith('file://') ? path : `file://${path}`;

export function CameraCapture({
  camera,
  mediaType,
  maxDuration,
  onCaptured,
  onClose,
}: CameraCaptureProps) {
  const cameraPermission = useCameraPermission();
  const microphonePermission = useMicrophonePermission();
  const [position, setPosition] = useState<CameraPosition>(camera);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string>();
  const recorderRef = useRef<Recorder | undefined>(undefined);
  const processingIdsRef = useRef(new Set<string>());
  const photoOutput = usePhotoOutput();
  const videoOutput = useVideoOutput({
    enableAudio: mediaType.includes('video'),
  });
  const outputs = useMemo(
    () =>
      [
        mediaType.includes('image') ? photoOutput : undefined,
        mediaType.includes('video') ? videoOutput : undefined,
      ].filter(Boolean) as (typeof photoOutput)[],
    [mediaType, photoOutput, videoOutput],
  );

  useEffect(() => {
    if (
      !cameraPermission.hasPermission &&
      cameraPermission.canRequestPermission
    )
      void cameraPermission.requestPermission();
    if (
      mediaType.includes('video') &&
      !microphonePermission.hasPermission &&
      microphonePermission.canRequestPermission
    ) {
      void microphonePermission.requestPermission();
    }
  }, [cameraPermission, mediaType, microphonePermission]);

  const finish = async (path: string, fileType: MediaFileType) => {
    const tempFilePath = toFileUri(path);
    const metadata = await readMediaFile(tempFilePath, fileType, (id) => {
      processingIdsRef.current.add(id);
    });
    onCaptured({ tempFilePath, fileType, ...metadata });
  };

  const capturePhoto = async () => {
    try {
      const photo = await photoOutput.capturePhotoToFile({}, {});
      await finish(photo.filePath, 'image');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '拍摄失败');
    }
  };

  const toggleRecording = async () => {
    try {
      if (recorderRef.current?.isRecording) {
        await recorderRef.current.stopRecording();
        return;
      }
      const recorder = await videoOutput.createRecorder({ maxDuration });
      recorderRef.current = recorder;
      setRecording(true);
      await recorder.startRecording(
        (path) => {
          setRecording(false);
          void finish(path, 'video');
        },
        (reason) => {
          setRecording(false);
          setError(reason.message);
        },
      );
    } catch (reason) {
      setRecording(false);
      setError(reason instanceof Error ? reason.message : '录像失败');
    }
  };

  useEffect(
    () => () => {
      if (recorderRef.current?.isRecording)
        void recorderRef.current.cancelRecording();
      for (const id of processingIdsRef.current) cancelVideoCompression(id);
      processingIdsRef.current.clear();
    },
    [],
  );

  const microphoneRequired = mediaType.includes('video');
  if (
    !cameraPermission.hasPermission ||
    (microphoneRequired && !microphonePermission.hasPermission)
  ) {
    return (
      <View style={styles.permission}>
        <Text style={styles.message}>
          {!cameraPermission.hasPermission
            ? '需要相机权限'
            : '录像需要麦克风权限'}
        </Text>
        <Pressable onPress={onClose}>
          <Text style={styles.link}>返回</Text>
        </Pressable>
      </View>
    );
  }

  const captureMode = mediaType.length === 1 ? mediaType[0] : 'image';
  return (
    <View style={styles.root}>
      <Camera
        style={StyleSheet.absoluteFill}
        isActive
        device={position}
        outputs={outputs}
      />
      <View style={styles.top}>
        <Pressable onPress={onClose}>
          <Text style={styles.action}>×</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <View style={styles.controls}>
        <Pressable
          style={styles.secondary}
          onPress={() =>
            setPosition((value) => (value === 'back' ? 'front' : 'back'))
          }
        >
          <Text style={styles.action}>↻</Text>
        </Pressable>
        <Pressable
          style={[styles.shutter, recording && styles.recording]}
          onPress={captureMode === 'video' ? toggleRecording : capturePhoto}
          accessibilityLabel={captureMode === 'video' ? '录制视频' : '拍照'}
        />
        {mediaType.includes('video') && mediaType.includes('image') ? (
          <Pressable style={styles.secondary} onPress={toggleRecording}>
            <Text style={styles.videoText}>视频</Text>
          </Pressable>
        ) : (
          <View style={styles.secondary} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: {
    position: 'absolute',
    top: 24,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  recording: { backgroundColor: '#ef4444' },
  secondary: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: { color: '#fff', fontSize: 34 },
  videoText: { color: '#fff', fontSize: 14 },
  error: { color: '#fff', flex: 1, textAlign: 'center' },
  permission: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  message: { color: '#fff', fontSize: 17 },
  link: { color: '#22c55e', fontSize: 16 },
});
