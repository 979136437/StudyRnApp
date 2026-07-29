#import <React/RCTViewComponentView.h>

NS_ASSUME_NONNULL_BEGIN

/// 隐藏的 Fabric 刷新控件。公开声明供 RN componentProvider 注册，具体滚动视图
/// 监听、状态机和 Nitro 绑定均封装在 Objective-C++ 实现中。
@interface NitroRefreshControlComponentView : RCTViewComponentView
@end

NS_ASSUME_NONNULL_END
