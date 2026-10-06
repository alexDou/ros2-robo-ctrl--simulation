cmake_minimum_required(VERSION 3.8)
project(robot_control_interfaces)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

find_package(ament_cmake REQUIRED)
find_package(rosidl_default_generators REQUIRED)
find_package(action_msgs REQUIRED)
find_package(geometry_msgs REQUIRED)
find_package(builtin_interfaces REQUIRED)

rosidl_generate_interfaces(${PROJECT_NAME}
  "action/PickAndPlace.action"
  "action/ConveyorRun.action"
  "action/StationExchange.action"
  "srv/ConveyorStop.srv"
  "srv/ConveyorFinish.srv"
  "srv/CellFaultAck.srv"
  "srv/ConveyorFreeze.srv"
  "srv/CellFill.srv"
  "srv/CellProcess.srv"
  "srv/FeederFill.srv"
  "srv/FeederEnable.srv"
  "srv/FeederQuickEmpty.srv"
  "srv/CellReset.srv"
  "srv/CellStop.srv"
  "srv/GetDropSlot.srv"
  "srv/ClearWorkspace.srv"
  "srv/RegisterGear.srv"
  "srv/ScrapRejected.srv"
  "srv/ResetStation.srv"
  "srv/SpawnObject.srv"
  "srv/MarkGrasped.srv"
  "srv/CommitDrop.srv"
  DEPENDENCIES
    action_msgs
    geometry_msgs
    builtin_interfaces
)

if(BUILD_TESTING)
  find_package(ament_lint_auto REQUIRED)
  ament_lint_auto_find_test_dependencies()
endif()

ament_export_dependencies(rosidl_default_runtime)
ament_package()
