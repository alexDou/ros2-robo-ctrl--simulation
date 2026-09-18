@live @unit-6.5 @e2e
Feature: Live Multi-Service Integration Verification
  As a workcell operator
  I want the TeleopClient to drive the real ROS2 + Gateway stack
  So that table click triggers gear spawn, IK trajectory execution, SpindleTower stacking, HOME return, and UI unlock without mocks

  @live @live-pick-and-place
  Scenario: Live pick-and-place closed loop from table click to SpindleTower deposit and HOME return
    # Precondition: operator booted scripts/launch_ros2.sh and scripts/launch_gateway.sh.
    # Harness (E2E_LIVE=1) fails fast on Gateway /health when stack is absent.
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the 3D robot model should be fully loaded in the WebGL scene
    And the 3D workcell table should be mounted in the WebGL scene
    And the SpindleTower fixture should be mounted in the WebGL scene
    # Deterministic start: tower state persists in real WorkcellNode across runs.
    When the operator clicks the "Clear Workspace" button
    Then no active gear should be present in the workspace
    And the SpindleTower should contain 0 gears
    And clicking the workcell table is unlocked
    When the operator clicks the workcell table at coordinates x 0.50 and y 0.00
    Then an active gear should be present in the workspace
    And clicking the workcell table is locked out
    And the action progress bar should become visible
    And the gear should attach to the robot tool flange
    And the gear should be deposited on the SpindleTower at height 0.00 m
    And the action progress bar should indicate completed
    And the connection status should indicate "CONNECTED / IDLE"
    And clicking the workcell table is unlocked
    And the telemetry streaming frequency should be approximately 30 Hz
    And the telemetry latency should remain below 50 ms
