#include <jni.h>
#include <fbjni/fbjni.h>

#include "NitroVisibilityObserverOnLoad.hpp"

// 动态库加载时统一注册 Nitrogen 生成的 JNI 类型和 Hybrid View。
JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, []() {
    margelo::nitro::visibilityobserver::registerAllNatives();
  });
}
