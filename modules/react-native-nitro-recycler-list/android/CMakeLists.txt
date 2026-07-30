project(NitroRecyclerList)
cmake_minimum_required(VERSION 3.13)

set(PACKAGE_NAME NitroRecyclerList)
set(CMAKE_VERBOSE_MAKEFILE ON)
set(CMAKE_CXX_STANDARD 20)

add_library(${PACKAGE_NAME} SHARED
  src/main/cpp/cpp-adapter.cpp
)

include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/NitroRecyclerList+autolinking.cmake)

find_library(LOG_LIB log)

target_link_libraries(
  ${PACKAGE_NAME}
  ${LOG_LIB}
  android
)
