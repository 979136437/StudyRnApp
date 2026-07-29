#include <jni.h>
#include <fbjni/fbjni.h>

#include "NitroRefreshOnLoad.hpp"

// Android 加载 libNitroRefresh.so 时的唯一入口。facebook::jni::initialize 负责
// 初始化 fbjni，随后 Nitrogen 生成的函数注册 JNI 类型和 RefreshController 构造器。
JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, []() {
    margelo::nitro::refresh::registerAllNatives();
  });
}
