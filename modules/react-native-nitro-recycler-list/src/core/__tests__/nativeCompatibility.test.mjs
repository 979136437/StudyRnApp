import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const generatedComponents = [
  new URL(
    '../../../nitrogen/generated/shared/c++/views/HybridRecyclerListViewComponent.cpp',
    import.meta.url,
  ),
  new URL(
    '../../../nitrogen/generated/shared/c++/views/HybridRecyclerCellHostViewComponent.cpp',
    import.meta.url,
  ),
];

describe('React Native 0.86 compatibility', () => {
  it.each(generatedComponents)(
    'avoids the dangling getConcreteSharedProps reference in %s',
    (component) => {
      const source = readFileSync(component, 'utf8');

      expect(source).not.toContain(
        'concreteShadowNode.getConcreteSharedProps()',
      );
      expect(source).toContain('concreteShadowNode.getProps()');
    },
  );
});
