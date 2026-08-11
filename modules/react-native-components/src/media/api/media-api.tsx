import { createElement, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { showPopup, type PopupRenderContext } from 'react-native-popup-kit';

import { ChooseMediaPage } from '../components/ChooseMediaPage';
import { PreviewMediaPage } from '../components/PreviewMediaPage';
import {
  executeCompressImage,
  executeCompressVideo,
} from '../core/compression';
import {
  normalizeChooseOptions,
  normalizePreviewOptions,
} from '../core/options';
import { runMediaTask } from '../core/task';
import type {
  ChooseMediaOptions,
  ChooseMediaResult,
  CompressImageOptions,
  CompressImageResult,
  CompressVideoOptions,
  CompressVideoResult,
  PreviewMediaOptions,
  PreviewMediaResult,
} from '../types';
import { MediaApiError } from '../types';

let mediaSessionActive = false;

interface MediaSessionProps {
  context: PopupRenderContext;
  choose?: ReturnType<typeof normalizeChooseOptions>;
  preview?: ReturnType<typeof normalizePreviewOptions>;
  settle: (
    value?: ChooseMediaResult | PreviewMediaResult,
    error?: MediaApiError,
  ) => void;
  registerBack: (handler: () => boolean) => void;
}

function MediaSession({
  context,
  choose,
  preview,
  settle,
  registerBack,
}: MediaSessionProps) {
  const [previewState, setPreviewState] = useState<
    ReturnType<typeof normalizePreviewOptions> | undefined
  >(preview);
  const close = (
    value?: ChooseMediaResult | PreviewMediaResult,
    error?: MediaApiError,
  ) => {
    settle(value, error);
    void context.close();
  };
  registerBack(() => {
    if (choose && previewState) {
      setPreviewState(undefined);
      return true;
    }
    return false;
  });

  return (
    <View style={styles.session}>
      {choose ? (
        <ChooseMediaPage
          options={choose}
          onCancel={() =>
            close(
              undefined,
              new MediaApiError('CANCELLED', 'chooseMedia:fail cancel'),
            )
          }
          onConfirm={(tempFiles) =>
            close({ errMsg: 'chooseMedia:ok', tempFiles })
          }
          onPreview={(sources, current) =>
            setPreviewState({ sources, current, showmenu: false })
          }
        />
      ) : null}
      {previewState ? (
        <View style={StyleSheet.absoluteFill}>
          <PreviewMediaPage
            {...previewState}
            onBack={choose ? () => setPreviewState(undefined) : undefined}
            onClose={() =>
              preview
                ? close({ errMsg: 'previewMedia:ok' })
                : setPreviewState(undefined)
            }
          />
        </View>
      ) : null}
    </View>
  );
}

const openMediaSession = <
  TResult extends ChooseMediaResult | PreviewMediaResult,
>(
  props: Pick<MediaSessionProps, 'choose' | 'preview'>,
) => {
  if (mediaSessionActive)
    return Promise.reject<TResult>(
      new MediaApiError('BUSY', '已有媒体会话正在进行'),
    );
  mediaSessionActive = true;
  let completed = false;
  let backHandler = () => false;
  return new Promise<TResult>((resolve, reject) => {
    const settle: MediaSessionProps['settle'] = (value, error) => {
      if (completed) return;
      completed = true;
      if (error) reject(error);
      else resolve(value as TResult);
    };
    const popupTask = showPopup({
      placement: 'fullscreen',
      mask: false,
      closeOnMaskPress: false,
      closeOnBackPress: true,
      useSafeArea: false,
      onBackPress: () => backHandler(),
      content: (context) =>
        createElement(MediaSession, {
          ...props,
          context,
          settle,
          registerBack: (handler) => {
            backHandler = handler;
          },
        }),
    });
    popupTask
      .then(
        () =>
          settle(undefined, new MediaApiError('CANCELLED', '媒体会话已关闭')),
        (error) =>
          settle(
            undefined,
            new MediaApiError('UNAVAILABLE', '媒体页面无法显示', error),
          ),
      )
      .finally(() => {
        mediaSessionActive = false;
      });
  });
};

export function chooseMedia(
  options: ChooseMediaOptions = {},
): Promise<ChooseMediaResult> {
  return runMediaTask(options, () =>
    openMediaSession<ChooseMediaResult>({
      choose: normalizeChooseOptions(options),
    }),
  );
}

export function previewMedia(
  options: PreviewMediaOptions,
): Promise<PreviewMediaResult> {
  return runMediaTask(options, () =>
    openMediaSession<PreviewMediaResult>({
      preview: normalizePreviewOptions(options),
    }),
  );
}

export function compressImage(
  options: CompressImageOptions,
): Promise<CompressImageResult> {
  return runMediaTask(options, async () => ({
    errMsg: 'compressImage:ok',
    tempFilePath: await executeCompressImage(options),
  }));
}

export function compressVideo(
  options: CompressVideoOptions,
): Promise<CompressVideoResult> {
  return runMediaTask(options, async () => {
    const result = await executeCompressVideo(options);
    return {
      errMsg: 'compressVideo:ok',
      tempFilePath: result.tempFilePath,
      size: result.size,
    };
  });
}

const styles = StyleSheet.create({
  session: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#151515',
  },
});
