#include <jni.h>
#include <fbjni/fbjni.h>
#include <memory>

#include <NitroModules/HybridObjectRegistry.hpp>

#include "JHybridNativeLoggerSpec.hpp"

namespace margelo::nitro::logger {

using namespace facebook;

struct JHybridNativeLoggerCompat final
    : public jni::JavaClass<JHybridNativeLoggerCompat,
                            JHybridNativeLoggerSpec::JavaPart> {
  static constexpr auto kJavaDescriptor =
      "Lcom/margelo/nitro/logger/HybridNativeLogger;";

  static std::shared_ptr<JHybridNativeLoggerSpec> create() {
    static const auto constructor =
        javaClassStatic()->getConstructor<JHybridNativeLoggerCompat::javaobject()>();
    return javaClassStatic()->newObject(constructor)->getJHybridNativeLoggerSpec();
  }
};

void registerLoggerNatives() {
  JHybridNativeLoggerSpec::CxxPart::registerNatives();
  HybridObjectRegistry::registerHybridObjectConstructor(
      "NativeLogger", []() -> std::shared_ptr<HybridObject> {
        return JHybridNativeLoggerCompat::create();
      });
}

} // namespace margelo::nitro::logger

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, []() {
    margelo::nitro::logger::registerLoggerNatives();
  });
}
