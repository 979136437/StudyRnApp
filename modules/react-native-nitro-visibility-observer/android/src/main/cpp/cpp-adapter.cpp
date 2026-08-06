#include <jni.h>
#include <fbjni/fbjni.h>
#include <memory>
#include <utility>

#include <NitroModules/HybridObjectRegistry.hpp>
#include <react/fabric/CoreComponentsRegistry.h>

#include "JFunc_void_NativeVisibilityChangeEvent.hpp"
#include "JHybridVisibilityObserverViewSpec.hpp"
#include "views/HybridVisibilityObserverViewComponent.hpp"
#include "views/JHybridVisibilityObserverViewStateUpdater.hpp"

namespace margelo::nitro::visibilityobserver {

using namespace facebook;
using namespace views;

class VisibilityObserverViewComponentDescriptor final
    : public react::ConcreteComponentDescriptor<HybridVisibilityObserverViewShadowNode> {
 public:
  explicit VisibilityObserverViewComponentDescriptor(
      const react::ComponentDescriptorParameters& parameters)
      : ConcreteComponentDescriptor(parameters, react::RawPropsParser()) {}

  std::shared_ptr<const react::Props> cloneProps(
      const react::PropsParserContext& context,
      const std::shared_ptr<const react::Props>& props,
      react::RawProps rawProps) const override {
    rawProps.parse(rawPropsParser_);
    return HybridVisibilityObserverViewShadowNode::Props(context, rawProps, props);
  }

  void adopt(react::ShadowNode& shadowNode) const override {
    auto& concreteShadowNode =
        static_cast<HybridVisibilityObserverViewShadowNode&>(shadowNode);

    // RN 0.86 的具体 Props getter 会产生临时引用，从基类持有的 shared_ptr 获取稳定副本。
    auto constProps = std::static_pointer_cast<const HybridVisibilityObserverViewProps>(
        concreteShadowNode.getProps());
    auto props = std::const_pointer_cast<HybridVisibilityObserverViewProps>(
        std::move(constProps));
    concreteShadowNode.setStateData(HybridVisibilityObserverViewState{std::move(props)});
  }
};

struct JHybridVisibilityObserverViewCompat final
    : public jni::JavaClass<JHybridVisibilityObserverViewCompat,
                            JHybridVisibilityObserverViewSpec::JavaPart> {
  static constexpr auto kJavaDescriptor =
      "Lcom/margelo/nitro/visibilityobserver/HybridVisibilityObserverView;";

  static std::shared_ptr<JHybridVisibilityObserverViewSpec> create() {
    static const auto constructor =
        javaClassStatic()->getConstructor<JHybridVisibilityObserverViewCompat::javaobject()>();
    auto javaPart = javaClassStatic()->newObject(constructor);
    return javaPart->getJHybridVisibilityObserverViewSpec();
  }
};

void registerVisibilityObserverNatives() {
  JHybridVisibilityObserverViewSpec::CxxPart::registerNatives();
  JFunc_void_NativeVisibilityChangeEvent_cxx::registerNatives();

  // 只复用生成的 JNI 更新函数，避免它同时注册与 RN 0.86 不兼容的 Descriptor。
  JHybridVisibilityObserverViewStateUpdater::javaClassStatic()->registerNatives({
      makeNativeMethod(
          "updateViewProps",
          JHybridVisibilityObserverViewStateUpdater::updateViewProps),
  });

  auto provider =
      react::concreteComponentDescriptorProvider<VisibilityObserverViewComponentDescriptor>();
  react::CoreComponentsRegistry::sharedProviderRegistry()->add(provider);

  HybridObjectRegistry::registerHybridObjectConstructor(
      "VisibilityObserverView",
      []() -> std::shared_ptr<HybridObject> {
        return JHybridVisibilityObserverViewCompat::create();
      });
}

} // namespace margelo::nitro::visibilityobserver

// 动态库加载时注册手写兼容入口，生成代码仍保持 Nitrogen 原样。
JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, []() {
    margelo::nitro::visibilityobserver::registerVisibilityObserverNatives();
  });
}
