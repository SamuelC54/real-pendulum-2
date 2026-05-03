cmake_minimum_required(VERSION 3.20)
project(teknic_motor LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT DEFINED TEKNIC_SDK_ROOT)
  set(TEKNIC_SDK_ROOT "C:/Program Files (x86)/Teknic/ClearView/sdk" CACHE PATH "Teknic ClearView SDK root (contains inc/, sFoundation Source/)")
endif()

set(SF_ROOT "${TEKNIC_SDK_ROOT}/sFoundation Source/sFoundation/win")

add_library(teknic_motor SHARED
  teknic_session.cpp
  motor_info.cpp
  hub_connect.cpp
  node_prepare.cpp
  teknic_api.cpp
)

target_compile_definitions(teknic_motor PRIVATE UNICODE _UNICODE)

target_include_directories(teknic_motor PRIVATE
  "${TEKNIC_SDK_ROOT}/inc"
  "${TEKNIC_SDK_ROOT}/inc/inc-pub"
)

if(CMAKE_CONFIGURATION_TYPES)
  target_link_libraries(teknic_motor PRIVATE
    $<IF:$<CONFIG:Debug>,${SF_ROOT}/Debug/x64/sFoundation20.lib,${SF_ROOT}/Release/x64/sFoundation20.lib>
  )
  add_custom_command(TARGET teknic_motor POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
      $<IF:$<CONFIG:Debug>,${SF_ROOT}/Debug/x64/sFoundation20.dll,${SF_ROOT}/Release/x64/sFoundation20.dll>
      $<TARGET_FILE_DIR:teknic_motor>
  )
else()
  # Ninja / single-config: map Release/Debug from CMAKE_BUILD_TYPE
  if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
  endif()
  string(TOLOWER "${CMAKE_BUILD_TYPE}" _cfg)
  if(_cfg STREQUAL "debug")
    set(_sf_lib "${SF_ROOT}/Debug/x64/sFoundation20.lib")
    set(_sf_dll "${SF_ROOT}/Debug/x64/sFoundation20.dll")
  else()
    set(_sf_lib "${SF_ROOT}/Release/x64/sFoundation20.lib")
    set(_sf_dll "${SF_ROOT}/Release/x64/sFoundation20.dll")
  endif()
  target_link_libraries(teknic_motor PRIVATE "${_sf_lib}")
  add_custom_command(TARGET teknic_motor POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different "${_sf_dll}" $<TARGET_FILE_DIR:teknic_motor>
  )
endif()

set_target_properties(teknic_motor PROPERTIES PREFIX "" OUTPUT_NAME "teknic_motor")

# Parent project is motor_native (umbrella). Emit DLL to …/native/build/<Config>/ not …/build/teknic_motor/<Config>/.
set_target_properties(teknic_motor PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/$<CONFIG>")
