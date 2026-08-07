# react-native-nitro-picker-view

基于 Nitro Hybrid View 的双端高性能多列滚轮选择器。原生列表负责行复用、惯性滚动、中心吸附、边缘渐隐与连续放大，JS 只在滚动结束后接收选中事件。

```tsx
<PickerView
  fontSize={18}
  selectedTextColor="#202124"
  textColor="#9aa0a6"
  value={[0, 1]}
  onChange={({ value }) => setValue([...value])}
>
  <PickerViewColumn>{['春', '夏', '秋', '冬']}</PickerViewColumn>
  <PickerViewColumn>{[2025, 2026, 2027]}</PickerViewColumn>
</PickerView>
```
