#import "NitroRefreshControlComponentView.h"

// Swift 兼容头由当前 NitroRefresh Pod 目标生成在 DerivedSources，而不是公开头目录。
// 使用同目标导入可让 Xcode 通过 generated-files/DerivedSources 搜索路径解析该文件。
#import "NitroRefresh-Swift.h"
#import <React/RCTConversions.h>
#import <React/RCTFabricComponentsPlugins.h>
#import <React/RCTScrollViewComponentView.h>
#import <react/renderer/components/NitroRefreshSpec/ComponentDescriptors.h>
#import <react/renderer/components/NitroRefreshSpec/EventEmitters.h>
#import <react/renderer/components/NitroRefreshSpec/Props.h>

using namespace facebook::react;

@interface NitroRefreshControlComponentView () <NitroRefreshViewBinding>
@end

// 隐藏的 Fabric ComponentView。它不直接绘制刷新头，只监听所属 UIScrollView，
// 实际刷新头由 React/Reanimated 绝对定位渲染。
@implementation NitroRefreshControlComponentView {
  // RN 0.86 的 Fabric ScrollView 宿主；弱引用避免形成 UIKit 视图环。
  __weak RCTScrollViewComponentView *_scrollViewComponentView;
  // controllerId 将本视图与 JS 创建的 Nitro HybridObject 配对。
  NSString *_controllerId;
  BOOL _enabled;
  BOOL _refreshing;
  CGFloat _pullDistance;
  CGFloat _maxPullDistance;
  CGFloat _dragRate;
  CGFloat _currentOffset;
  NSString *_phase;
  // 刷新期间会临时修改 contentInset，必须保存业务原值并在结束或回收时恢复。
  UIEdgeInsets _originalContentInset;
  BOOL _hasOriginalContentInset;
}

+ (void)load
{
  [super load];
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    self.hidden = YES;
    _props = NitroRefreshControlViewShadowNode::defaultSharedProps();
    _enabled = YES;
    _pullDistance = 80;
    _maxPullDistance = 160;
    _dragRate = 0.5;
    _phase = @"idle";
  }
  return self;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<NitroRefreshControlViewComponentDescriptor>();
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  const auto &newProps = static_cast<const NitroRefreshControlViewProps &>(*props);
  NSString *nextControllerId = RCTNSStringFromString(newProps.controllerId);

  // Fabric 复用 ComponentView 时 id 可能变化，先解除旧绑定再关联新控制器。
  if (_controllerId != nil && ![_controllerId isEqualToString:nextControllerId]) {
    [NitroRefreshControllerRegistry detachControllerId:_controllerId binding:self];
  }

  _controllerId = nextControllerId;
  _enabled = newProps.enabled;
  // JS 已执行校验；原生层仍保留最后一道保护，避免除零或负 inset。
  _pullDistance = MAX(1, newProps.pullDistance);
  _maxPullDistance = MAX(_pullDistance, newProps.maxPullDistance);
  _dragRate = MIN(1, MAX(0.01, newProps.dragRate));

  if (_controllerId.length > 0) {
    [NitroRefreshControllerRegistry attachControllerId:_controllerId binding:self];
  }
  if (!_enabled) {
    [self setRefreshingFromController:NO];
  }

  [super updateProps:props oldProps:oldProps];
}

- (void)didMoveToSuperview
{
  [super didMoveToSuperview];
  if (self.superview != nil) {
    [self attachToScrollView];
  } else {
    [self detachFromScrollView];
  }
}

- (void)prepareForRecycle
{
  // Fabric 回收不等同于 dealloc，所有手势 target、inset 和注册表关系都要主动清理。
  [self detachFromScrollView];
  if (_controllerId.length > 0) {
    [NitroRefreshControllerRegistry detachControllerId:_controllerId binding:self];
  }
  _controllerId = nil;
  _phase = @"idle";
  _currentOffset = 0;
  [super prepareForRecycle];
}

- (void)attachToScrollView
{
  [self detachFromScrollView];
  // 使用 RN 自带刷新控件采用的查找方式，支持 ScrollView、VirtualizedList 和 FlashList。
  _scrollViewComponentView = [RCTScrollViewComponentView findScrollViewComponentViewForView:self];
  UIScrollView *scrollView = _scrollViewComponentView.scrollView;
  if (scrollView == nil) {
    return;
  }
  // 只保存未进入刷新状态时的业务 inset，后续结束刷新时精确恢复。
  _originalContentInset = scrollView.contentInset;
  _hasOriginalContentInset = YES;
  [scrollView.panGestureRecognizer addTarget:self action:@selector(handlePan:)];
}

- (void)detachFromScrollView
{
  UIScrollView *scrollView = _scrollViewComponentView.scrollView;
  if (scrollView != nil) {
    [scrollView.panGestureRecognizer removeTarget:self action:@selector(handlePan:)];
    // 卸载或换宿主时必须恢复 inset，避免列表留下永久顶部空白。
    if (_hasOriginalContentInset) {
      scrollView.contentInset = _originalContentInset;
    }
  }
  _scrollViewComponentView = nil;
  _hasOriginalContentInset = NO;
}

- (void)handlePan:(UIPanGestureRecognizer *)gesture
{
  if (!_enabled || _refreshing) {
    return;
  }
  UIScrollView *scrollView = _scrollViewComponentView.scrollView;
  if (scrollView == nil) {
    return;
  }

  // adjustedContentInset 同时考虑 safe area 和业务 inset；只有越过真实顶部才得到正值。
  CGFloat rawOffset = MAX(0, -(scrollView.contentOffset.y + scrollView.adjustedContentInset.top));
  // UIScrollView 提供系统橡皮筋物理，本模块在其基础上应用可配置阻尼与最大距离。
  CGFloat offset = MIN(_maxPullDistance, rawOffset * _dragRate);

  if (gesture.state == UIGestureRecognizerStateChanged && offset > 0) {
    NSString *phase = offset >= _pullDistance ? @"ready" : @"pulling";
    [self updatePhase:phase offset:offset];
  } else if (gesture.state == UIGestureRecognizerStateEnded ||
             gesture.state == UIGestureRecognizerStateCancelled ||
             gesture.state == UIGestureRecognizerStateFailed) {
    // cancelled/failed 永远不触发刷新，只有正常松手且达到阈值才进入 refreshing。
    if (offset >= _pullDistance && gesture.state == UIGestureRecognizerStateEnded) {
      [self beginRefreshingAndNotify:YES];
    } else {
      [self settleToIdle];
    }
  }
}

- (void)setRefreshingFromController:(BOOL)refreshing
{
  // Nitro 控制器可能从任意线程调用；所有 UIKit 修改统一回到主队列。
  dispatch_async(dispatch_get_main_queue(), ^{
    if (refreshing) {
      [self beginRefreshingAndNotify:NO];
    } else {
      [self settleToIdle];
    }
  });
}

- (void)beginRefreshingAndNotify:(BOOL)notify
{
  if (_refreshing) {
    return;
  }
  _refreshing = YES;
  [self updatePhase:@"refreshing" offset:_pullDistance];

  UIScrollView *scrollView = _scrollViewComponentView.scrollView;
  if (scrollView != nil) {
    if (!_hasOriginalContentInset) {
      _originalContentInset = scrollView.contentInset;
      _hasOriginalContentInset = YES;
    }
    // 增加顶部 inset 形成刷新保持区域，并把 offset 对齐到新 inset 的顶部。
    UIEdgeInsets inset = _originalContentInset;
    inset.top += _pullDistance;
    [UIView animateWithDuration:0.22 animations:^{
      scrollView.contentInset = inset;
      CGPoint point = scrollView.contentOffset;
      point.y = -scrollView.adjustedContentInset.top;
      scrollView.contentOffset = point;
    }];
  }

  // 程序化 refreshing=true 不回调 onRefresh，防止 React 受控更新形成通知回路。
  if (notify && _controllerId.length > 0) {
    [NitroRefreshControllerRegistry requestRefreshForControllerId:_controllerId];
  }
}

- (void)settleToIdle
{
  if (!_refreshing && _currentOffset == 0 && [_phase isEqualToString:@"idle"]) {
    return;
  }
  _refreshing = NO;
  [self updatePhase:@"settling" offset:_currentOffset];

  UIScrollView *scrollView = _scrollViewComponentView.scrollView;
  UIEdgeInsets targetInset = _hasOriginalContentInset ? _originalContentInset : UIEdgeInsetsZero;
  // 先发布 settling，动画完成后才清零连续位移并发布 idle。
  [UIView animateWithDuration:0.22
      animations:^{
        if (scrollView != nil && self->_hasOriginalContentInset) {
          scrollView.contentInset = targetInset;
        }
      }
      completion:^(__unused BOOL finished) {
        [self updatePhase:@"idle" offset:0];
      }];
}

- (void)updatePhase:(NSString *)phase offset:(CGFloat)offset
{
  BOOL phaseChanged = ![_phase isEqualToString:phase];
  _phase = phase;
  _currentOffset = MAX(0, MIN(_maxPullDistance, offset));
  // Nitro 只接收离散变化；即使阶段不变，Fabric 仍需逐帧发送最新 offset。
  if (phaseChanged && _controllerId.length > 0) {
    [NitroRefreshControllerRegistry notifyControllerId:_controllerId phase:phase];
  }
  [self emitPull];
}

- (void)emitPull
{
  if (!_eventEmitter) {
    return;
  }
  // progress 被限制在 0...1，超阈值的原始距离仍完整保留在 offset。
  NitroRefreshControlViewEventEmitter::OnPull event = {
      .offset = _currentOffset,
      .progress = MIN(1, MAX(0, _currentOffset / _pullDistance)),
      .phase = std::string(_phase.UTF8String),
  };
  std::static_pointer_cast<NitroRefreshControlViewEventEmitter const>(_eventEmitter)->onPull(event);
}

@end

Class<RCTComponentViewProtocol> NitroRefreshControlComponentViewCls(void)
{
  return NitroRefreshControlComponentView.class;
}
