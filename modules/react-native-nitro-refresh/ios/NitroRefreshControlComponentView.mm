#import "NitroRefreshControlComponentView.h"

// Nitrogen 的伞头会先声明 Swift 兼容头所引用的 C++ 类型与 margelo 命名空间，
// 再从当前 NitroRefresh Pod 的 DerivedSources 中包含 NitroRefresh-Swift.h。
// 不可直接包含 Swift 兼容头，否则 Swift C++ 互操作生成的类型会缺少前置声明。
#import "NitroRefresh-Swift-Cxx-Umbrella.hpp"
#import <React/RCTConversions.h>
#import <React/RCTCustomPullToRefreshViewProtocol.h>
#import <React/RCTFabricComponentsPlugins.h>
#import <React/RCTScrollViewComponentView.h>
#import <react/renderer/components/NitroRefreshSpec/ComponentDescriptors.h>
#import <react/renderer/components/NitroRefreshSpec/EventEmitters.h>
#import <react/renderer/components/NitroRefreshSpec/Props.h>

using namespace facebook::react;

static const CGFloat NitroRefreshDefaultHeaderHeight = 80;
static const CGFloat NitroRefreshDefaultLimit = 160;
static const CGFloat NitroRefreshDefaultDragRate = 1;
static const CGFloat NitroRefreshMinimumDimension = 1;
static const CGFloat NitroRefreshMinimumDragRate = 0.01;
static const CGFloat NitroRefreshLayoutEpsilon = 0.5;
static const NSTimeInterval NitroRefreshReboundDuration = 0.28;

@interface NitroRefreshControlComponentView () <NitroRefreshViewBinding, RCTCustomPullToRefreshViewProtocol>
- (void)beginRefreshingAndNotify:(BOOL)notify;
- (void)captureScrollBaseline:(UIScrollView *)scrollView;
- (void)updateActiveOffsetForConfigurationChange;
- (void)settleToIdle;
- (void)updatePhase:(NSString *)phase offset:(CGFloat)offset progress:(CGFloat)progress;
@end

// Fabric ComponentView 直接挂载为 UIScrollView 的刷新控件子视图，并承载 React 刷新头。
@implementation NitroRefreshControlComponentView {
  // RN 0.86 的 Fabric ScrollView 宿主；弱引用避免形成 UIKit 视图环。
  __weak RCTScrollViewComponentView *_scrollViewComponentView;
  // controllerId 将本视图与 JS 创建的 Nitro HybridObject 配对。
  NSString *_controllerId;
  BOOL _enabled;
  BOOL _refreshing;
  // 与 _refreshing 分开保存最近一次 React 受控意图。用户松手会先更新原生状态，
  // React 随后才回传 true；该字段用于识别重复属性和未被调用方确认的刷新请求。
  BOOL _controlledRefreshing;
  CGFloat _threshold;
  CGFloat _headerHeight;
  CGFloat _limit;
  CGFloat _dragRate;
  CGFloat _currentOffset;
  CGFloat _currentProgress;
  NSString *_phase;
  BOOL _readyToRefresh;
  CADisplayLink *_transitionDisplayLink;
  CGFloat _transitionStartOffset;
  CGFloat _transitionStartProgress;
  // 刷新期间会临时修改 contentInset，必须保存业务原值并在结束或回收时恢复。
  UIEdgeInsets _originalContentInset;
  // contentInset 改变后 adjustedContentInset.top 也会改变；动画位移必须始终相对原基线。
  CGFloat _originalAdjustedTop;
  BOOL _hasOriginalContentInset;
  BOOL _originalAlwaysBounceVertical;
  BOOL _hasOriginalAlwaysBounceVertical;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    self.backgroundColor = UIColor.clearColor;
    self.clipsToBounds = NO;
    self.userInteractionEnabled = NO;
    _props = NitroRefreshControlViewShadowNode::defaultSharedProps();
    _enabled = YES;
    _threshold = NitroRefreshDefaultHeaderHeight;
    _headerHeight = NitroRefreshDefaultHeaderHeight;
    _limit = NitroRefreshDefaultLimit;
    _dragRate = NitroRefreshDefaultDragRate;
    _phase = @"idle";
  }
  return self;
}

- (void)dealloc
{
  // CADisplayLink 强持有 target；即使 ComponentView 未走正常回收路径也必须主动断开。
  [_transitionDisplayLink invalidate];
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<NitroRefreshControlViewComponentDescriptor>();
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  const auto &newProps = static_cast<const NitroRefreshControlViewProps &>(*props);
  NSString *nextControllerId = RCTNSStringFromString(newProps.controllerId);
  BOOL controllerChanged =
      _controllerId != nextControllerId && ![_controllerId isEqualToString:nextControllerId];
  CGFloat previousThreshold = _threshold;
  CGFloat previousHeaderHeight = _headerHeight;
  CGFloat previousLimit = _limit;

  // Fabric 复用 ComponentView 时 id 可能变化，先解除旧绑定再关联新控制器。
  if (controllerChanged && _controllerId.length > 0) {
    [NitroRefreshControllerRegistry detachControllerId:_controllerId binding:self];
  }

  _controllerId = nextControllerId;
  _enabled = newProps.enabled;
  // JS 已执行校验；原生层仍保留最后一道保护，避免除零或负 inset。
  _threshold = MAX(NitroRefreshMinimumDimension, newProps.threshold);
  _headerHeight = MAX(NitroRefreshMinimumDimension, newProps.headerHeight);
  _limit = MAX(MAX(_threshold, _headerHeight), newProps.limit);
  _dragRate = MIN(NitroRefreshDefaultDragRate,
                  MAX(NitroRefreshMinimumDragRate, newProps.dragRate));

  if (controllerChanged && _controllerId.length > 0) {
    [NitroRefreshControllerRegistry attachControllerId:_controllerId binding:self];
  }
  if (!_enabled) {
    [self settleToIdle];
  }

  [super updateProps:props oldProps:oldProps];
  self.userInteractionEnabled = NO;

  UIScrollView *scrollView = _scrollViewComponentView.scrollView;
  if (scrollView != nil && _hasOriginalAlwaysBounceVertical) {
    scrollView.alwaysBounceVertical = _enabled ? YES : _originalAlwaysBounceVertical;
  }
  if (_enabled &&
      (ABS(previousThreshold - _threshold) >= NitroRefreshLayoutEpsilon ||
       ABS(previousHeaderHeight - _headerHeight) >= NitroRefreshLayoutEpsilon ||
       ABS(previousLimit - _limit) >= NitroRefreshLayoutEpsilon)) {
    [self updateActiveOffsetForConfigurationChange];
  }
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
  _readyToRefresh = NO;
  _refreshing = NO;
  _controlledRefreshing = NO;
  _currentOffset = 0;
  _currentProgress = 0;
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
  [self captureScrollBaseline:scrollView];
  _originalAlwaysBounceVertical = scrollView.alwaysBounceVertical;
  _hasOriginalAlwaysBounceVertical = YES;
  scrollView.alwaysBounceVertical = _enabled ? YES : _originalAlwaysBounceVertical;
  [scrollView.panGestureRecognizer addTarget:self action:@selector(handlePan:)];
}

- (void)detachFromScrollView
{
  [self stopTrackingTransition];
  UIScrollView *scrollView = _scrollViewComponentView.scrollView;
  if (scrollView != nil) {
    [scrollView.panGestureRecognizer removeTarget:self action:@selector(handlePan:)];
    // 卸载或换宿主时必须恢复 inset，避免列表留下永久顶部空白。
    BOOL shouldRestoreTop = _refreshing || _currentOffset > 0;
    if (_hasOriginalContentInset) {
      scrollView.contentInset = _originalContentInset;
      if (shouldRestoreTop) {
        CGPoint point = scrollView.contentOffset;
        point.y = -_originalAdjustedTop;
        scrollView.contentOffset = point;
      }
    }
    if (_hasOriginalAlwaysBounceVertical) {
      scrollView.alwaysBounceVertical = _originalAlwaysBounceVertical;
    }
  }
  _scrollViewComponentView = nil;
  _hasOriginalContentInset = NO;
  _hasOriginalAlwaysBounceVertical = NO;
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

  if (gesture.state == UIGestureRecognizerStateBegan) {
    // 导航栏、旋转和安全区变化都可能更新 adjustedContentInset。每次空闲手势开始时
    // 重新捕获业务基线，避免沿用挂载时的旧 safe-area top。
    [self captureScrollBaseline:scrollView];
    return;
  }

  // 始终相对当前手势开始时的顶部基线计算，避免刷新期间 contentInset 改变后坐标系跳变。
  CGFloat rawOffset = MAX(0, -(scrollView.contentOffset.y + _originalAdjustedTop));
  // UIScrollView 已经把手指位移转换成带系统阻尼的可见内容位移。offset 必须使用这个
  // 实际位移，刷新头才能紧贴列表；再次乘 dragRate 会让刷新头只移动列表的一部分。
  CGFloat offset = MIN(_limit, rawOffset);
  // dragRate 只调节触发灵敏度，不破坏刷新头和列表之间的一比一视觉关系。
  CGFloat triggerOffset = MIN(_limit, rawOffset * _dragRate);

  if (gesture.state == UIGestureRecognizerStateChanged && offset > 0) {
    _readyToRefresh = triggerOffset >= _threshold;
    NSString *phase = _readyToRefresh ? @"ready" : @"pulling";
    [self updatePhase:phase offset:offset progress:(triggerOffset / _threshold)];
  } else if (gesture.state == UIGestureRecognizerStateEnded ||
             gesture.state == UIGestureRecognizerStateCancelled ||
             gesture.state == UIGestureRecognizerStateFailed) {
    // cancelled/failed 永远不触发刷新，只有正常松手且达到阈值才进入 refreshing。
    BOOL shouldRefresh = _readyToRefresh && gesture.state == UIGestureRecognizerStateEnded;
    _readyToRefresh = NO;
    if (shouldRefresh) {
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
      self->_controlledRefreshing = YES;
      [self beginRefreshingAndNotify:NO];
    } else if (self->_controlledRefreshing || self->_refreshing) {
      self->_controlledRefreshing = NO;
      [self settleToIdle];
    }
  });
}

- (void)beginRefreshingAndNotify:(BOOL)notify
{
  if (!_enabled || _refreshing) {
    return;
  }
  UIScrollView *scrollView = _scrollViewComponentView.scrollView;
  if (scrollView != nil) {
    [self captureScrollBaseline:scrollView];
  }
  _controlledRefreshing = YES;
  _refreshing = YES;
  _readyToRefresh = NO;

  if (scrollView != nil) {
    CGFloat initialOffset = [self visibleOffsetForScrollView:scrollView];
    [self updatePhase:@"refreshing" offset:initialOffset progress:1];

    // 增加顶部 inset 形成刷新保持区域，并把 offset 对齐到新 inset 的顶部。
    UIEdgeInsets inset = _originalContentInset;
    inset.top += _headerHeight;
    [self startTrackingTransition];
    [UIView animateWithDuration:NitroRefreshReboundDuration
        delay:0
        options:UIViewAnimationOptionBeginFromCurrentState |
                UIViewAnimationOptionCurveEaseOut |
                UIViewAnimationOptionAllowUserInteraction
        animations:^{
          scrollView.contentInset = inset;
          CGPoint point = scrollView.contentOffset;
          point.y = -(self->_originalAdjustedTop + self->_headerHeight);
          scrollView.contentOffset = point;
        }
        completion:^(BOOL finished) {
          if (!finished || !self->_refreshing ||
              self->_scrollViewComponentView.scrollView != scrollView) {
            return;
          }
          [self stopTrackingTransition];
          [self updatePhase:@"refreshing" offset:self->_headerHeight progress:1];
        }];
  } else {
    [self updatePhase:@"refreshing" offset:_headerHeight progress:1];
  }

  // 程序化 refreshing=true 不回调 onRefresh，防止 React 受控更新形成通知回路。
  if (notify && _controllerId.length > 0) {
    [NitroRefreshControllerRegistry requestRefreshForControllerId:_controllerId];
  }
}

- (void)captureScrollBaseline:(UIScrollView *)scrollView
{
  _originalContentInset = scrollView.contentInset;
  _originalAdjustedTop = scrollView.adjustedContentInset.top;
  _hasOriginalContentInset = YES;
}

- (void)updateActiveOffsetForConfigurationChange
{
  if (!_refreshing) {
    if (_currentOffset > _limit) {
      [self updatePhase:_phase offset:_limit progress:_currentProgress];
    }
    return;
  }

  CGFloat targetOffset = _headerHeight;
  NSString *targetPhase = _phase;
  UIScrollView *scrollView = _scrollViewComponentView.scrollView;
  if (scrollView == nil) {
    [self updatePhase:targetPhase offset:targetOffset progress:1];
    return;
  }

  if (!_hasOriginalContentInset) {
    _originalContentInset = scrollView.contentInset;
    _originalAdjustedTop = scrollView.adjustedContentInset.top;
    _hasOriginalContentInset = YES;
  }
  CGFloat initialOffset = [self visibleOffsetForScrollView:scrollView];
  [self updatePhase:targetPhase
             offset:initialOffset
           progress:1];

  UIEdgeInsets inset = _originalContentInset;
  inset.top += targetOffset;
  [self startTrackingTransition];
  [UIView animateWithDuration:NitroRefreshReboundDuration
      delay:0
      options:UIViewAnimationOptionBeginFromCurrentState |
              UIViewAnimationOptionCurveEaseOut |
              UIViewAnimationOptionAllowUserInteraction
      animations:^{
        scrollView.contentInset = inset;
        CGPoint point = scrollView.contentOffset;
        point.y = -(self->_originalAdjustedTop + targetOffset);
        scrollView.contentOffset = point;
      }
      completion:^(BOOL finished) {
        if (!finished || self->_scrollViewComponentView.scrollView != scrollView) {
          return;
        }
        if ([self->_phase isEqualToString:targetPhase]) {
          [self stopTrackingTransition];
          [self updatePhase:targetPhase offset:self->_headerHeight progress:1];
        }
      }];
}

- (void)settleToIdle
{
  if (!_refreshing && _currentOffset == 0 && [_phase isEqualToString:@"idle"]) {
    return;
  }
  _controlledRefreshing = NO;
  _refreshing = NO;
  _readyToRefresh = NO;

  UIScrollView *scrollView = _scrollViewComponentView.scrollView;
  UIEdgeInsets targetInset = _hasOriginalContentInset ? _originalContentInset : UIEdgeInsetsZero;
  CGFloat initialOffset = scrollView != nil ? [self visibleOffsetForScrollView:scrollView] : _currentOffset;
  [self updatePhase:@"settling"
             offset:initialOffset
           progress:_currentProgress];

  if (scrollView != nil) {
    // 显式动画 contentInset 和 contentOffset，避免系统回弹与另一条补间动画叠加。
    // CADisplayLink 会读取这条动画的呈现位置，自定义刷新头无需猜测 UIKit 曲线。
    [self startTrackingTransition];
    [UIView animateWithDuration:NitroRefreshReboundDuration
        delay:0
        options:UIViewAnimationOptionBeginFromCurrentState |
                UIViewAnimationOptionCurveEaseOut |
                UIViewAnimationOptionAllowUserInteraction
        animations:^{
          if (self->_hasOriginalContentInset) {
            scrollView.contentInset = targetInset;
          }
          CGPoint point = scrollView.contentOffset;
          point.y = -self->_originalAdjustedTop;
          scrollView.contentOffset = point;
        }
        completion:^(BOOL finished) {
          if (!finished || self->_refreshing ||
              self->_scrollViewComponentView.scrollView != scrollView) {
            return;
          }
          [self stopTrackingTransition];
          [self updatePhase:@"idle" offset:0 progress:0];
        }];
  } else {
    [self updatePhase:@"idle" offset:0 progress:0];
  }
}

- (CGFloat)visibleOffsetForScrollView:(UIScrollView *)scrollView
{
  // UIView 动画开始后模型层会立即持有目标 contentOffset，只有 presentationLayer
  // 的 bounds.origin 才是当前屏幕实际显示的位置。
  CALayer *presentationLayer = scrollView.layer.presentationLayer;
  CGFloat contentOffsetY = presentationLayer != nil
      ? presentationLayer.bounds.origin.y
      : scrollView.contentOffset.y;
  CGFloat offset = MAX(0, -(contentOffsetY + _originalAdjustedTop));
  return MIN(_limit, offset);
}

- (void)startTrackingTransition
{
  [self stopTrackingTransition];
  _transitionStartOffset = _currentOffset;
  _transitionStartProgress = _currentProgress;
  _transitionDisplayLink = [CADisplayLink displayLinkWithTarget:self
                                                       selector:@selector(trackTransition:)];
  [_transitionDisplayLink addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
}

- (void)stopTrackingTransition
{
  [_transitionDisplayLink invalidate];
  _transitionDisplayLink = nil;
}

- (void)trackTransition:(__unused CADisplayLink *)displayLink
{
  UIScrollView *scrollView = _scrollViewComponentView.scrollView;
  if (scrollView == nil) {
    [self stopTrackingTransition];
    return;
  }

  CGFloat offset = [self visibleOffsetForScrollView:scrollView];
  CGFloat progress;
  if ([_phase isEqualToString:@"refreshing"]) {
    progress = 1;
  } else if ([_phase isEqualToString:@"settling"] && _transitionStartOffset > 0) {
    // 回弹进度沿用松手时的值并按剩余位移等比衰减，避免低于阈值时突然变大。
    progress = _transitionStartProgress * (offset / _transitionStartOffset);
  } else {
    progress = MIN(1, offset / _threshold);
  }
  [self updatePhase:_phase offset:offset progress:progress];
}

- (void)updatePhase:(NSString *)phase offset:(CGFloat)offset progress:(CGFloat)progress
{
  BOOL phaseChanged = ![_phase isEqualToString:phase];
  _phase = phase;
  _currentOffset = MAX(0, MIN(_limit, offset));
  _currentProgress = MIN(1, MAX(0, progress));
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
      .progress = _currentProgress,
      .phase = std::string(_phase.UTF8String),
  };
  std::static_pointer_cast<NitroRefreshControlViewEventEmitter const>(_eventEmitter)->onPull(event);
}

@end

Class<RCTComponentViewProtocol> NitroRefreshControlComponentViewCls(void)
{
  return NitroRefreshControlComponentView.class;
}
