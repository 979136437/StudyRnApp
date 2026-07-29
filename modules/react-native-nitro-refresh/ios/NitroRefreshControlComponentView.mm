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
#include <cmath>

using namespace facebook::react;

@interface NitroRefreshControlComponentView () <NitroRefreshViewBinding, RCTCustomPullToRefreshViewProtocol>
- (void)beginRefreshingAndNotify:(BOOL)notify;
- (void)finishRefreshingWithResult:(NSString *)result resultDuration:(double)resultDuration;
- (void)pullToMax;
- (void)scheduleResultDismissAfter:(double)resultDuration;
- (void)cancelResultDismiss;
- (BOOL)isShowingResult;
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
  CGFloat _pullDistance;
  CGFloat _maxPullDistance;
  CGFloat _dragRate;
  CGFloat _currentOffset;
  CGFloat _currentProgress;
  NSString *_phase;
  BOOL _readyToRefresh;
  BOOL _programmaticPull;
  CADisplayLink *_transitionDisplayLink;
  CGFloat _transitionStartOffset;
  CGFloat _transitionStartProgress;
  dispatch_block_t _resultDismissBlock;
  NSUInteger _resultDismissGeneration;
  // 刷新期间会临时修改 contentInset，必须保存业务原值并在结束或回收时恢复。
  UIEdgeInsets _originalContentInset;
  // contentInset 改变后 adjustedContentInset.top 也会改变；动画位移必须始终相对原基线。
  CGFloat _originalAdjustedTop;
  BOOL _hasOriginalContentInset;
  BOOL _originalAlwaysBounceVertical;
  BOOL _hasOriginalAlwaysBounceVertical;
}

+ (void)load
{
  [super load];
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    self.backgroundColor = UIColor.clearColor;
    self.clipsToBounds = NO;
    self.userInteractionEnabled = NO;
    _props = NitroRefreshControlViewShadowNode::defaultSharedProps();
    _enabled = YES;
    _pullDistance = 80;
    _maxPullDistance = 160;
    _dragRate = 0.5;
    _phase = @"idle";
  }
  return self;
}

- (void)dealloc
{
  [self cancelResultDismiss];
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
    [self cancelRefreshFromController];
  }

  [super updateProps:props oldProps:oldProps];
  self.userInteractionEnabled = NO;

  UIScrollView *scrollView = _scrollViewComponentView.scrollView;
  if (scrollView != nil && _hasOriginalAlwaysBounceVertical) {
    scrollView.alwaysBounceVertical = _enabled ? YES : _originalAlwaysBounceVertical;
  }
}

- (void)didMoveToSuperview
{
  [super didMoveToSuperview];
  if (self.superview != nil) {
    [self attachToScrollView];
  } else {
    [self cancelResultDismiss];
    [self detachFromScrollView];
  }
}

- (void)prepareForRecycle
{
  // Fabric 回收不等同于 dealloc，所有手势 target、inset 和注册表关系都要主动清理。
  [self cancelResultDismiss];
  [self detachFromScrollView];
  if (_controllerId.length > 0) {
    [NitroRefreshControllerRegistry detachControllerId:_controllerId binding:self];
  }
  _controllerId = nil;
  _phase = @"idle";
  _readyToRefresh = NO;
  _programmaticPull = NO;
  _refreshing = NO;
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
  _originalContentInset = scrollView.contentInset;
  _originalAdjustedTop = scrollView.adjustedContentInset.top;
  _hasOriginalContentInset = YES;
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
    if (_hasOriginalContentInset) {
      scrollView.contentInset = _originalContentInset;
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
  if (!_enabled || _refreshing || _programmaticPull ||
      [_phase isEqualToString:@"success"] || [_phase isEqualToString:@"failure"]) {
    return;
  }
  UIScrollView *scrollView = _scrollViewComponentView.scrollView;
  if (scrollView == nil) {
    return;
  }

  // 始终相对挂载时的顶部基线计算，避免刷新期间 contentInset 改变后坐标系跳变。
  CGFloat rawOffset = MAX(0, -(scrollView.contentOffset.y + _originalAdjustedTop));
  // UIScrollView 已经把手指位移转换成带系统阻尼的可见内容位移。offset 必须使用这个
  // 实际位移，刷新头才能紧贴列表；再次乘 dragRate 会让刷新头只移动列表的一部分。
  CGFloat offset = MIN(_maxPullDistance, rawOffset);
  // dragRate 仍用于调节触发灵敏度。默认 0.5 表示系统可见位移达到阈值两倍时触发，
  // 但不会破坏刷新头和列表之间的一比一视觉关系。
  CGFloat triggerOffset = MIN(_maxPullDistance, rawOffset * _dragRate);

  if (gesture.state == UIGestureRecognizerStateChanged && offset > 0) {
    _readyToRefresh = triggerOffset >= _pullDistance;
    NSString *phase = _readyToRefresh ? @"ready" : @"pulling";
    [self updatePhase:phase offset:offset progress:(triggerOffset / _pullDistance)];
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
      [self beginRefreshingAndNotify:NO];
    } else if (![self isShowingResult]) {
      [self settleToIdle];
    }
  });
}

- (void)beginRefreshFromController
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [self beginRefreshingAndNotify:YES];
  });
}

- (void)cancelRefreshFromController
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [self settleToIdle];
  });
}

- (void)finishRefreshFromController:(NSString *)result resultDuration:(double)resultDuration
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [self finishRefreshingWithResult:result resultDuration:resultDuration];
  });
}

- (void)pullToMaxFromController
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [self pullToMax];
  });
}

- (void)beginRefreshingAndNotify:(BOOL)notify
{
  if (!_enabled || _refreshing ||
      (_programmaticPull && ![_phase isEqualToString:@"ready"])) {
    return;
  }
  [self cancelResultDismiss];
  _refreshing = YES;
  _readyToRefresh = NO;
  _programmaticPull = NO;

  UIScrollView *scrollView = _scrollViewComponentView.scrollView;
  if (scrollView != nil) {
    if (!_hasOriginalContentInset) {
      _originalContentInset = scrollView.contentInset;
      _originalAdjustedTop = scrollView.adjustedContentInset.top;
      _hasOriginalContentInset = YES;
    }
    CGFloat initialOffset = [self visibleOffsetForScrollView:scrollView];
    [self updatePhase:@"refreshing" offset:initialOffset progress:1];

    // 增加顶部 inset 形成刷新保持区域，并把 offset 对齐到新 inset 的顶部。
    UIEdgeInsets inset = _originalContentInset;
    inset.top += _pullDistance;
    [self startTrackingTransition];
    [UIView animateWithDuration:0.28
        delay:0
        options:UIViewAnimationOptionBeginFromCurrentState |
                UIViewAnimationOptionCurveEaseOut |
                UIViewAnimationOptionAllowUserInteraction
        animations:^{
          scrollView.contentInset = inset;
          CGPoint point = scrollView.contentOffset;
          point.y = -(self->_originalAdjustedTop + self->_pullDistance);
          scrollView.contentOffset = point;
        }
        completion:^(BOOL finished) {
          if (!finished || !self->_refreshing ||
              self->_scrollViewComponentView.scrollView != scrollView) {
            return;
          }
          [self stopTrackingTransition];
          [self updatePhase:@"refreshing" offset:self->_pullDistance progress:1];
        }];
  } else {
    [self updatePhase:@"refreshing" offset:_pullDistance progress:1];
  }

  // 程序化 refreshing=true 不回调 onRefresh，防止 React 受控更新形成通知回路。
  if (notify && _controllerId.length > 0) {
    [NitroRefreshControllerRegistry requestRefreshForControllerId:_controllerId];
  }
}

- (void)finishRefreshingWithResult:(NSString *)result resultDuration:(double)resultDuration
{
  if (!_refreshing ||
      (![result isEqualToString:@"success"] && ![result isEqualToString:@"failure"])) {
    return;
  }

  [self cancelResultDismiss];
  _refreshing = NO;
  _readyToRefresh = NO;
  _programmaticPull = NO;

  UIScrollView *scrollView = _scrollViewComponentView.scrollView;
  CGFloat initialOffset = scrollView != nil ? [self visibleOffsetForScrollView:scrollView] : _currentOffset;
  [self updatePhase:result offset:initialOffset progress:1];

  if (scrollView != nil) {
    if (!_hasOriginalContentInset) {
      _originalContentInset = scrollView.contentInset;
      _originalAdjustedTop = scrollView.adjustedContentInset.top;
      _hasOriginalContentInset = YES;
    }
    UIEdgeInsets inset = _originalContentInset;
    inset.top += _pullDistance;
    [self startTrackingTransition];
    [UIView animateWithDuration:0.28
        delay:0
        options:UIViewAnimationOptionBeginFromCurrentState |
                UIViewAnimationOptionCurveEaseOut |
                UIViewAnimationOptionAllowUserInteraction
        animations:^{
          scrollView.contentInset = inset;
          CGPoint point = scrollView.contentOffset;
          point.y = -(self->_originalAdjustedTop + self->_pullDistance);
          scrollView.contentOffset = point;
        }
        completion:^(BOOL finished) {
          if (!finished || ![self->_phase isEqualToString:result] ||
              self->_scrollViewComponentView.scrollView != scrollView) {
            return;
          }
          [self stopTrackingTransition];
          [self updatePhase:result offset:self->_pullDistance progress:1];
          [self scheduleResultDismissAfter:resultDuration];
        }];
  } else {
    [self updatePhase:result offset:_pullDistance progress:1];
    [self scheduleResultDismissAfter:resultDuration];
  }
}

- (void)pullToMax
{
  if (!_enabled || _refreshing || _programmaticPull ||
      (![_phase isEqualToString:@"idle"] && ![_phase isEqualToString:@"settling"])) {
    return;
  }

  [self cancelResultDismiss];
  _programmaticPull = YES;
  _readyToRefresh = NO;

  UIScrollView *scrollView = _scrollViewComponentView.scrollView;
  CGFloat initialOffset = scrollView != nil ? [self visibleOffsetForScrollView:scrollView] : _currentOffset;
  [self updatePhase:@"pulling"
             offset:initialOffset
           progress:MIN(1, initialOffset / _pullDistance)];

  if (scrollView != nil) {
    if (!_hasOriginalContentInset) {
      _originalContentInset = scrollView.contentInset;
      _originalAdjustedTop = scrollView.adjustedContentInset.top;
      _hasOriginalContentInset = YES;
    }
    UIEdgeInsets inset = _originalContentInset;
    inset.top += _maxPullDistance;
    [self startTrackingTransition];
    [UIView animateWithDuration:0.28
        delay:0
        options:UIViewAnimationOptionBeginFromCurrentState |
                UIViewAnimationOptionCurveEaseOut |
                UIViewAnimationOptionAllowUserInteraction
        animations:^{
          scrollView.contentInset = inset;
          CGPoint point = scrollView.contentOffset;
          point.y = -(self->_originalAdjustedTop + self->_maxPullDistance);
          scrollView.contentOffset = point;
        }
        completion:^(BOOL finished) {
          if (!finished || !self->_programmaticPull ||
              self->_scrollViewComponentView.scrollView != scrollView) {
            return;
          }
          [self stopTrackingTransition];
          [self updatePhase:@"ready" offset:self->_maxPullDistance progress:1];
        }];
  } else {
    [self updatePhase:@"ready" offset:_maxPullDistance progress:1];
  }
}

- (void)scheduleResultDismissAfter:(double)resultDuration
{
  [self cancelResultDismiss];
  NSTimeInterval duration = std::isfinite(resultDuration) ? MAX(0, resultDuration) / 1000.0 : 0.8;
  NSUInteger generation = _resultDismissGeneration;
  __weak __typeof(self) weakSelf = self;
  dispatch_block_t block = dispatch_block_create(0, ^{
    __strong __typeof(weakSelf) self = weakSelf;
    if (self == nil || generation != self->_resultDismissGeneration) {
      return;
    }
    self->_resultDismissBlock = nil;
    if ([self isShowingResult]) {
      [self settleToIdle];
    }
  });
  _resultDismissBlock = block;

  if (duration == 0) {
    dispatch_async(dispatch_get_main_queue(), block);
  } else {
    dispatch_after(
        dispatch_time(DISPATCH_TIME_NOW, (int64_t)(duration * NSEC_PER_SEC)),
        dispatch_get_main_queue(),
        block);
  }
}

- (void)cancelResultDismiss
{
  if (_resultDismissBlock != nil) {
    dispatch_block_cancel(_resultDismissBlock);
    _resultDismissBlock = nil;
  }
  _resultDismissGeneration += 1;
}

- (BOOL)isShowingResult
{
  return [_phase isEqualToString:@"success"] || [_phase isEqualToString:@"failure"];
}

- (void)settleToIdle
{
  if (!_refreshing && _currentOffset == 0 && [_phase isEqualToString:@"idle"]) {
    return;
  }
  [self cancelResultDismiss];
  _refreshing = NO;
  _readyToRefresh = NO;
  _programmaticPull = NO;

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
    [UIView animateWithDuration:0.28
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
  return MIN(_maxPullDistance, offset);
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
    progress = MIN(1, offset / _pullDistance);
  }
  [self updatePhase:_phase offset:offset progress:progress];
}

- (void)updatePhase:(NSString *)phase offset:(CGFloat)offset progress:(CGFloat)progress
{
  BOOL phaseChanged = ![_phase isEqualToString:phase];
  _phase = phase;
  _currentOffset = MAX(0, MIN(_maxPullDistance, offset));
  _currentProgress = MIN(1, MAX(0, progress));
  if (_controllerId.length > 0) {
    // 快照只在原生对象之间更新；只有 getState 主动读取时才跨越 JSI。
    [NitroRefreshControllerRegistry updateControllerId:_controllerId
                                                  phase:phase
                                                 offset:_currentOffset
                                             refreshing:_refreshing];
    if (phaseChanged) {
      [NitroRefreshControllerRegistry notifyControllerId:_controllerId phase:phase];
    }
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
