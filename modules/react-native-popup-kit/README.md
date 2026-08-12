# react-native-popup-kit

基于 React Native `Modal` 与 Reanimated 的层叠及 FIFO 弹窗管理器。

```tsx
import {
  PopupDisplayMode,
  PopupMode,
  PopupProvider,
  hidePopup,
  showPopup,
  usePopup,
} from 'react-native-popup-kit';

<PopupProvider>{children}</PopupProvider>;

const id = await showPopup({
  children: <Content />,
  displayMode: PopupDisplayMode.STACK,
  mode: PopupMode.CENTER,
  popupStyle: { backgroundColor: '#fff' },
  overlayStyle: { backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  overlayContent: <CustomOverlay />,
});
await hidePopup(id);
```

`overlayContent` 只负责视觉内容，不接管触摸事件；遮罩点击关闭仍由 popup-kit 控制。可以按需传入项目已有的 `BlurView`，未传入时继续使用默认半透明遮罩。

`displayMode` 默认为 `PopupDisplayMode.QUEUE`，按 FIFO 顺序展示。父子弹窗或必须立即覆盖当前弹窗时，显式使用 `PopupDisplayMode.STACK`；多个 stack 按调用时间排序，最后调用者位于最上层。

公开的 `PopupDisplayMode` 与 `PopupMode` 字面量对象用于避免业务代码散落字符串，同时仍兼容直接传入原有字符串值。

模块级 API 控制最外层 `PopupProvider`。嵌套 `PopupProvider` 会创建独立的局部管理域，其后代通过 `usePopup()` 获取局部控制器。每个 Provider 的 queue 只显示队首，stack 会立即显示；不同 Provider 之间互不阻塞。
