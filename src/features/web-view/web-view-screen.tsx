import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { ISIOS } from '@/constant';
const htmlTemplate = require('./index.html');

function enableInlineVideo(html: string): string {
  return html.replace(/<video\b[^>]*>/gi, (videoTag) => {
    let inlineVideoTag = videoTag;

    // iOS 内联播放需要原生开关和 video 属性同时生效。
    if (!/\splaysinline(?:\s|=|\/?>)/i.test(inlineVideoTag)) {
      inlineVideoTag = inlineVideoTag.replace(
        /^<video\b/i,
        '<video playsinline',
      );
    }

    if (!/\swebkit-playsinline(?:\s|=|\/?>)/i.test(inlineVideoTag)) {
      inlineVideoTag = inlineVideoTag.replace(
        /^<video\b/i,
        '<video webkit-playsinline',
      );
    }

    return inlineVideoTag;
  });
}

export interface WebViewScreenProps {
  url?: string;
  html?: string;
}
export function WebViewScreen({ html, url }: WebViewScreenProps) {
  const [htmlText, setHtmlText] = useState('');
  const [hasHtmlError, setHasHtmlError] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadTemplate() {
      try {
        const asset = Asset.fromModule(htmlTemplate);

        await asset.downloadAsync();

        if (!asset.localUri) {
          throw new Error('HTML 模板没有可读取的本地地址');
        }

        // 3. 核心：使用 FileSystem 读取本地文件的纯文本内容
        const templateStr = await FileSystem.readAsStringAsync(asset.localUri, {
          encoding: FileSystem.EncodingType.UTF8, // 指定使用 UTF-8 编码读取
        });

        if (active) {
          setHtmlText(
            enableInlineVideo(
              templateStr.replace(/\{\{html\}\}/g, () => html ?? ''),
            ),
          );
          setHasHtmlError(false);
        }
      } catch (error: unknown) {
        if (active) {
          setHtmlText('');
          setHasHtmlError(true);
        }
        console.error('HTML 模板加载失败', error);
      }
    }

    if (html !== undefined) {
      setHtmlText('');
      setHasHtmlError(false);
      void loadTemplate();
    } else {
      setHtmlText('');
      setHasHtmlError(false);
    }

    return () => {
      active = false;
    };
  }, [html]);

  if (hasHtmlError) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text selectable>网页内容加载失败</Text>
      </View>
    );
  }

  return (
    <WebView
      source={
        url
          ? { uri: url }
          : {
              html: htmlText,
            }
      }
      style={{ flex: 1 }}
      {...(ISIOS ? { decelerationRate: 'normal' } : {})}
      allowsBackForwardNavigationGestures
      allowsInlineMediaPlayback
    />
  );
}
