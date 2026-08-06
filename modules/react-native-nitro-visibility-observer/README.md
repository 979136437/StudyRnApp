# react-native-nitro-visibility-observer

使用 Nitro Hybrid View 在 iOS、Android 和 Web 上监听包装区域的几何可见状态。

```tsx
<VisibilityObserver
  threshold={0.5}
  minimumVisibleDurationMs={300}
  onVisibilityChange={({ isVisible }) => {
    // 根据可见状态暂停或恢复高成本内容。
  }}
>
  <Content />
</VisibilityObserver>
```

原生端仅在首次测量或跨越阈值时通知 JavaScript。可见性包含应用前台状态，
但不检测任意兄弟浮层造成的逐像素遮挡。
