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

所有可见弹窗都会铺满根渲染宿主并拦截底层交互。局部 Provider 仍维护独立作用域，但其渲染层会提升到最近的根宿主，避免被局部容器或滚动区域裁切。`mask` 只控制遮罩颜色是否可见；即使设为 `false`，透明拦截层仍会阻止触摸穿透。

Toast 与 Loading 不提供 `mask` 参数，始终不显示背景遮罩，但显示期间仍会阻止页面操作。

每种展示 API 都可通过 `component` 覆盖默认内容组件，视觉配置跟随当前调用，不依赖全局 Theme：

```tsx
import { Text } from 'react-native';
import { showToast, type ToastComponentProps } from 'react-native-popup-kit';

function SavedToast({ options }: ToastComponentProps) {
  return <Text>{options.title}</Text>;
}

showToast({ title: '已保存', component: SavedToast });
```

Toast、Loading 和 Modal 中用于展示的 `title`、`content`、`cancelText`、`confirmText` 均支持 `ReactNode`。传入字符串或数字时使用默认文字样式，传入组件时保留组件自身结构与样式。
