import type { ReactNode } from 'react';
import { Text, type TextProps } from 'react-native';

interface OptionNodeProps extends Omit<TextProps, 'children'> {
  children: ReactNode;
}

function isPrimitiveNode(node: ReactNode): node is string | number | bigint {
  return (
    typeof node === 'string' ||
    typeof node === 'number' ||
    typeof node === 'bigint'
  );
}

export function optionNodeAccessibilityLabel(
  node: ReactNode,
): string | undefined {
  return isPrimitiveNode(node) ? String(node) : undefined;
}

export function OptionNode({
  children,
  ...textProps
}: OptionNodeProps): React.JSX.Element {
  // 自定义节点应保留自身结构；只有原始文本才应用默认 Text 样式。
  return isPrimitiveNode(children) ? (
    <Text {...textProps}>{String(children)}</Text>
  ) : (
    <>{children}</>
  );
}
