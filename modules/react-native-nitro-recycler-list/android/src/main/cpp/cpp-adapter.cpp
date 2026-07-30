#include <jni.h>
#include "NitroRecyclerListOnLoad.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return margelo::nitro::recyclerlist::initialize(vm);
}
