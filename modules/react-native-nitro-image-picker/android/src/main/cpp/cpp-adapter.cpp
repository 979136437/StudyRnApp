#include <jni.h>
#include <fbjni/fbjni.h>
#include <memory>
#include <utility>

#include <NitroModules/HybridObjectRegistry.hpp>
#include <react/fabric/CoreComponentsRegistry.h>

#include "JFunc_void_MediaLibraryChangeEvent.hpp"
#include "JFunc_void_ThumbnailErrorEvent.hpp"
#include "JFunc_void_ThumbnailLoadEvent.hpp"
#include "JHybridImagePickerSpec.hpp"
#include "JHybridMediaThumbnailSpec.hpp"
#include "views/HybridMediaThumbnailComponent.hpp"
#include "views/JHybridMediaThumbnailStateUpdater.hpp"

namespace margelo::nitro::imagepicker {

using namespace facebook;
using namespace views;

class MediaThumbnailComponentDescriptor final
    : public react::ConcreteComponentDescriptor<HybridMediaThumbnailShadowNode> {
 public:
  explicit MediaThumbnailComponentDescriptor(
      const react::ComponentDescriptorParameters& parameters)
      : ConcreteComponentDescriptor(parameters, react::RawPropsParser()) {}

  std::shared_ptr<const react::Props> cloneProps(
      const react::PropsParserContext& context,
      const std::shared_ptr<const react::Props>& props,
      react::RawProps rawProps) const override {
    rawProps.parse(rawPropsParser_);
    return HybridMediaThumbnailShadowNode::Props(context, rawProps, props);
  }

  void adopt(react::ShadowNode& shadowNode) const override {
    auto& node = static_cast<HybridMediaThumbnailShadowNode&>(shadowNode);
    auto constProps = std::static_pointer_cast<const HybridMediaThumbnailProps>(node.getProps());
    node.setStateData(HybridMediaThumbnailState{
        std::const_pointer_cast<HybridMediaThumbnailProps>(std::move(constProps))});
  }
};

struct JHybridImagePickerCompat final
    : public jni::JavaClass<JHybridImagePickerCompat,
                            JHybridImagePickerSpec::JavaPart> {
  static constexpr auto kJavaDescriptor = "Lcom/margelo/nitro/imagepicker/HybridImagePicker;";
  static std::shared_ptr<JHybridImagePickerSpec> create() {
    static const auto constructor =
        javaClassStatic()->getConstructor<JHybridImagePickerCompat::javaobject()>();
    return javaClassStatic()->newObject(constructor)->getJHybridImagePickerSpec();
  }
};

struct JHybridMediaThumbnailCompat final
    : public jni::JavaClass<JHybridMediaThumbnailCompat,
                            JHybridMediaThumbnailSpec::JavaPart> {
  static constexpr auto kJavaDescriptor = "Lcom/margelo/nitro/imagepicker/HybridMediaThumbnail;";
  static std::shared_ptr<JHybridMediaThumbnailSpec> create() {
    static const auto constructor =
        javaClassStatic()->getConstructor<JHybridMediaThumbnailCompat::javaobject()>();
    return javaClassStatic()->newObject(constructor)->getJHybridMediaThumbnailSpec();
  }
};

void registerImagePickerNatives() {
  JHybridImagePickerSpec::CxxPart::registerNatives();
  JFunc_void_MediaLibraryChangeEvent_cxx::registerNatives();
  JHybridMediaThumbnailSpec::CxxPart::registerNatives();
  JFunc_void_ThumbnailLoadEvent_cxx::registerNatives();
  JFunc_void_ThumbnailErrorEvent_cxx::registerNatives();
  JHybridMediaThumbnailStateUpdater::javaClassStatic()->registerNatives({
      makeNativeMethod("updateViewProps", JHybridMediaThumbnailStateUpdater::updateViewProps),
  });

  react::CoreComponentsRegistry::sharedProviderRegistry()->add(
      react::concreteComponentDescriptorProvider<MediaThumbnailComponentDescriptor>());
  HybridObjectRegistry::registerHybridObjectConstructor(
      "ImagePicker", []() -> std::shared_ptr<HybridObject> {
        return JHybridImagePickerCompat::create();
      });
  HybridObjectRegistry::registerHybridObjectConstructor(
      "MediaThumbnail", []() -> std::shared_ptr<HybridObject> {
        return JHybridMediaThumbnailCompat::create();
      });
}

} // namespace margelo::nitro::imagepicker

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, []() {
    margelo::nitro::imagepicker::registerImagePickerNatives();
  });
}
