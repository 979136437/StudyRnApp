#include <jni.h>
#include <fbjni/fbjni.h>
#include <memory>
#include <utility>

#include <NitroModules/HybridObjectRegistry.hpp>
#include <react/fabric/CoreComponentsRegistry.h>

#include "JFunc_void_NativePickerEvent.hpp"
#include "JHybridPickerViewSpec.hpp"
#include "views/HybridPickerViewComponent.hpp"
#include "views/JHybridPickerViewStateUpdater.hpp"

namespace margelo::nitro::pickerview {

using namespace facebook;
using namespace views;

class PickerViewComponentDescriptor final
    : public react::ConcreteComponentDescriptor<HybridPickerViewShadowNode> {
 public:
  explicit PickerViewComponentDescriptor(
      const react::ComponentDescriptorParameters& parameters)
      : ConcreteComponentDescriptor(parameters, react::RawPropsParser()) {}

  std::shared_ptr<const react::Props> cloneProps(
      const react::PropsParserContext& context,
      const std::shared_ptr<const react::Props>& props,
      react::RawProps rawProps) const override {
    rawProps.parse(rawPropsParser_);
    return HybridPickerViewShadowNode::Props(context, rawProps, props);
  }

  void adopt(react::ShadowNode& shadowNode) const override {
    auto& concreteShadowNode =
        static_cast<HybridPickerViewShadowNode&>(shadowNode);
    auto constProps = std::static_pointer_cast<const HybridPickerViewProps>(
        concreteShadowNode.getProps());
    auto props = std::const_pointer_cast<HybridPickerViewProps>(
        std::move(constProps));
    concreteShadowNode.setStateData(HybridPickerViewState{std::move(props)});
  }
};

struct JHybridPickerViewCompat final
    : public jni::JavaClass<JHybridPickerViewCompat,
                            JHybridPickerViewSpec::JavaPart> {
  static constexpr auto kJavaDescriptor =
      "Lcom/margelo/nitro/pickerview/HybridPickerView;";

  static std::shared_ptr<JHybridPickerViewSpec> create() {
    static const auto constructor =
        javaClassStatic()->getConstructor<JHybridPickerViewCompat::javaobject()>();
    auto javaPart = javaClassStatic()->newObject(constructor);
    return javaPart->getJHybridPickerViewSpec();
  }
};

void registerPickerViewNatives() {
  JHybridPickerViewSpec::CxxPart::registerNatives();
  JFunc_void_NativePickerEvent_cxx::registerNatives();

  JHybridPickerViewStateUpdater::javaClassStatic()->registerNatives({
      makeNativeMethod(
          "updateViewProps",
          JHybridPickerViewStateUpdater::updateViewProps),
  });

  auto provider =
      react::concreteComponentDescriptorProvider<PickerViewComponentDescriptor>();
  react::CoreComponentsRegistry::sharedProviderRegistry()->add(provider);

  HybridObjectRegistry::registerHybridObjectConstructor(
      "PickerView",
      []() -> std::shared_ptr<HybridObject> {
        return JHybridPickerViewCompat::create();
      });
}

} // namespace margelo::nitro::pickerview

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, []() {
    margelo::nitro::pickerview::registerPickerViewNatives();
  });
}
