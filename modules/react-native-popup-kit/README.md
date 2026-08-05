# react-native-popup-kit

项目内统一的 Popup、Toast、Loading 与 Modal 能力。模块提供全局 API、局部 Provider 和作用域 hooks。

```tsx
import {
  PopupProvider,
  closePopup,
  showModal,
  useToast,
} from 'react-native-popup-kit';

const task = showModal({ content: '确认继续？', title: '提示' });
closePopup(task.id);

function LocalArea({ children }: React.PropsWithChildren) {
  return <PopupProvider scope="local">{children}</PopupProvider>;
}
```

全局展示 API 需要根级 `PopupProvider scope="global"`。hooks 默认操作最近的 Provider；`closePopup` 与 `closeAllPopups` 可跨作用域关闭实例。

每种展示 API 都可通过 `component` 覆盖默认内容组件，视觉配置跟随当前调用，不依赖全局 Theme：

```tsx
import { Text } from 'react-native';
import { showToast, type ToastComponentProps } from 'react-native-popup-kit';

function SavedToast({ options }: ToastComponentProps) {
  return <Text>{options.title}</Text>;
}

showToast({ title: '已保存', component: SavedToast });
```
