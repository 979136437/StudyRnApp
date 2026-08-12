# react-native-responsive-units

为 React Native 提供基于设计稿宽度的尺寸换算，以及基于当前应用窗口的宽高比例换算。

```tsx
import {
  ResponsiveProvider,
  height,
  px2dp,
  rpx,
  useResponsiveUpdate,
  width,
} from 'react-native-responsive-units';

export function App() {
  return (
    <ResponsiveProvider designWidth={750}>
      <Screen />
    </ResponsiveProvider>
  );
}

function Screen() {
  useResponsiveUpdate();

  return (
    <View
      style={{
        width: width(0.5),
        height: height(0.25),
        padding: rpx(24),
        marginTop: px2dp(16),
      }}
    />
  );
}
```

`rpx` 与 `px2dp` 等价。`width` 和 `height` 会将有限比例夹在 `0` 到 `1` 之间。换算函数必须在根 Provider 挂载后调用；需要响应旋转、分屏或 Web 窗口变化的组件应调用 `useResponsiveUpdate()`。
