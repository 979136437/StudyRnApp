import { readFileSync, writeFileSync } from 'node:fs';

const generatedFiles = [
  {
    path: new URL(
      '../nitrogen/generated/shared/c++/views/HybridRecyclerListViewComponent.cpp',
      import.meta.url,
    ),
    propsName: 'HybridRecyclerListViewProps',
  },
  {
    path: new URL(
      '../nitrogen/generated/shared/c++/views/HybridRecyclerCellHostViewComponent.cpp',
      import.meta.url,
    ),
    propsName: 'HybridRecyclerCellHostViewProps',
  },
];

for (const { path, propsName } of generatedFiles) {
  const source = readFileSync(path, 'utf8');
  const legacy = `    const std::shared_ptr<const ${propsName}>& constProps = concreteShadowNode.getConcreteSharedProps();\n    const std::shared_ptr<${propsName}>& props = std::const_pointer_cast<${propsName}>(constProps);`;
  const replacement = `    // RN 0.86's getConcreteSharedProps() returns a reference to a temporary shared_ptr.\n    // Cast the stable base props by value to avoid copying that dangling reference.\n    const std::shared_ptr<${propsName}> props = std::const_pointer_cast<${propsName}>(\n      std::static_pointer_cast<const ${propsName}>(concreteShadowNode.getProps()));`;

  if (source.includes(replacement)) continue;
  if (!source.includes(legacy)) {
    throw new Error(`Nitrogen output changed unexpectedly: ${path.pathname}`);
  }
  writeFileSync(path, source.replace(legacy, replacement));
}
