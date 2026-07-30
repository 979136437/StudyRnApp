#import "RecyclerListRefreshEventSourceComponentView.h"

#import "NitroRecyclerList-Swift-Cxx-Umbrella.hpp"
#import <React/RCTConversions.h>
#import <React/RCTFabricComponentsPlugins.h>
#import <react/renderer/components/NitroRecyclerListRefreshSpec/ComponentDescriptors.h>
#import <react/renderer/components/NitroRecyclerListRefreshSpec/EventEmitters.h>
#import <react/renderer/components/NitroRecyclerListRefreshSpec/Props.h>

using namespace facebook::react;

@interface RecyclerListRefreshEventSourceComponentView () <RecyclerListRefreshEventSink>
@end

@implementation RecyclerListRefreshEventSourceComponentView {
  NSString *_listId;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<RecyclerListRefreshEventSourceViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    _props = RecyclerListRefreshEventSourceViewShadowNode::defaultSharedProps();
    self.userInteractionEnabled = NO;
    self.hidden = YES;
  }
  return self;
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  const auto &newProps = static_cast<const RecyclerListRefreshEventSourceViewProps &>(*props);
  NSString *nextListId = RCTNSStringFromString(newProps.listId);
  if (_listId.length > 0 && ![_listId isEqualToString:nextListId]) {
    [NitroRecyclerListRefreshEventRegistry unregisterSource:self listId:_listId];
  }
  _listId = nextListId;
  if (_listId.length > 0) {
    [NitroRecyclerListRefreshEventRegistry registerSource:self listId:_listId];
  }
  [super updateProps:props oldProps:oldProps];
  self.userInteractionEnabled = NO;
  self.hidden = YES;
}

- (void)prepareForRecycle
{
  if (_listId.length > 0) {
    [NitroRecyclerListRefreshEventRegistry unregisterSource:self listId:_listId];
  }
  _listId = nil;
  [super prepareForRecycle];
}

- (void)dealloc
{
  if (_listId.length > 0) {
    [NitroRecyclerListRefreshEventRegistry unregisterSource:self listId:_listId];
  }
}

- (void)emitRefreshWithPhase:(NSString *)phase offset:(double)offset progress:(double)progress
{
  if (!_eventEmitter) return;
  RecyclerListRefreshEventSourceViewEventEmitter::OnPull event = {
      .offset = MAX(0, offset),
      .progress = MIN(1, MAX(0, progress)),
      .phase = std::string(phase.UTF8String),
  };
  std::static_pointer_cast<RecyclerListRefreshEventSourceViewEventEmitter const>(_eventEmitter)->onPull(event);
}

@end

Class<RCTComponentViewProtocol> RecyclerListRefreshEventSourceComponentViewCls(void)
{
  return RecyclerListRefreshEventSourceComponentView.class;
}
