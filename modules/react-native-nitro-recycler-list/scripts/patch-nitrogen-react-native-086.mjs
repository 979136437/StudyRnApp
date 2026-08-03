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

const iosListComponent = new URL(
  '../nitrogen/generated/ios/c++/views/HybridRecyclerListViewComponent.mm',
  import.meta.url,
);
const managedMounting = `- (void)mountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index {
  [super mountChildComponentView:childComponentView index:index];
  if ([childComponentView isKindOfClass:[RCTViewComponentView class]]) {
    UIView* contentView = ((RCTViewComponentView*)childComponentView).contentView;
    SEL selector = NSSelectorFromString(@"nitroRecyclerComponentDidMount");
    if ([contentView respondsToSelector:selector]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
      [contentView performSelector:selector];
#pragma clang diagnostic pop
    }
  }
}

- (void)unmountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index {
  [childComponentView removeFromSuperview];
}`;
insertGeneratedPatch(
  iosListComponent,
  '- (instancetype) init {',
  managedMounting,
);

const iosHostComponent = new URL(
  '../nitrogen/generated/ios/c++/views/HybridRecyclerCellHostViewComponent.mm',
  import.meta.url,
);
const managedLayout = `- (void)updateLayoutMetrics:(const react::LayoutMetrics&)layoutMetrics
           oldLayoutMetrics:(const react::LayoutMetrics&)oldLayoutMetrics {
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];
  UIView* parent = self.superview;
  if (parent != nil && ![parent conformsToProtocol:@protocol(RCTComponentViewProtocol)]) {
    self.frame = parent.bounds;
  }
}`;
insertGeneratedPatch(
  iosHostComponent,
  '+ (BOOL)shouldBeRecycled {',
  managedLayout,
);

function insertGeneratedPatch(path, marker, patch) {
  const source = readFileSync(path, 'utf8');
  if (source.includes(patch)) return;
  if (!source.includes(marker)) {
    throw new Error(`Nitrogen output changed unexpectedly: ${path.pathname}`);
  }
  writeFileSync(path, source.replace(marker, `${patch}\n\n${marker}`));
}
