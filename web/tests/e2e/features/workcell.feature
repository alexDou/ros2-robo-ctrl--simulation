@workcell @unit-5.5 @e2e
Feature: Interactive 3D Workcell Table, Click-to-Place Gear Ingestion & Lifecycle Control
  As a robotic workcell operator
  I want to click on the 3D workcell table to place gear workpieces and clear the workspace
  So that reachability is validated in real time, commands propagate across Gateway and EdgeNode, and lockout invariants are enforced under 50ms latency

  @smoke @click-to-place @lockout
  Scenario: Click-to-place reachable gear renders 3D mesh, propagates command through Gateway to EdgeNode, and enforces click lockout
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the 3D robot model should be fully loaded in the WebGL scene
    And the 3D workcell table should be mounted in the WebGL scene
    And no active gear should be present in the workspace
    And the Clear Workspace button should be disabled
    When the operator clicks the workcell table at coordinates x 0.50 and y 0.00
    Then an active gear should be present in the workspace
    And the 3D gearwheel mesh should be positioned at x 0.50 and y 0.00
    And the Clear Workspace button should be enabled
    And clicking the workcell table is locked out
    And the EdgeNode ROS2 logger should record gear spawn at x 0.50 and y 0.00
    And the telemetry latency should remain below 50 ms

  @lifecycle @clear-workspace
  Scenario: Clicking Clear Workspace dispatches command, resets EdgeNode state, destroys 3D mesh, and restores click readiness
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the 3D robot model should be fully loaded in the WebGL scene
    And the 3D workcell table should be mounted in the WebGL scene
    When the operator clicks the workcell table at coordinates x 0.50 and y 0.10
    Then an active gear should be present in the workspace
    And the Clear Workspace button should be enabled
    When the operator clicks the "Clear Workspace" button
    Then no active gear should be present in the workspace
    And the Clear Workspace button should be disabled
    And clicking the workcell table is unlocked
    And the EdgeNode ROS2 logger should record workspace cleared
    And the telemetry latency should remain below 50 ms
    When the operator clicks the workcell table at coordinates x 0.45 and y -0.05
    Then an active gear should be present in the workspace
    And the 3D gearwheel mesh should be positioned at x 0.45 and y -0.05

  @reachability @bounds-gating
  Scenario: Unreachable table clicks do not spawn gear or lock out workspace
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the 3D robot model should be fully loaded in the WebGL scene
    And the 3D workcell table should be mounted in the WebGL scene
    When the operator clicks the workcell table at unreachable coordinates x 0.20 and y 0.00
    Then no active gear should be present in the workspace
    And the Clear Workspace button should be disabled
    And clicking the workcell table is unlocked

  @safety @motion-lockout
  Scenario: Workcell interactions are locked out when robot is in motion
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the 3D robot model should be fully loaded in the WebGL scene
    When the operator clicks the "Ready" pose button
    And the robot begins executing trajectory motion
    Then the Clear Workspace button should be disabled
    And clicking the workcell table is locked out

  @reticle @visual-feedback
  Scenario: Dynamic ring reticle provides visual reachability feedback during pointer hover
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the 3D robot model should be fully loaded in the WebGL scene
    And the 3D workcell table should be mounted in the WebGL scene
    When the operator hovers over the workcell table at coordinates x 0.50 and y 0.00
    Then the dynamic ring reticle should be visible
    When the operator hovers over the workcell table at coordinates x 0.20 and y 0.00
    Then the dynamic ring reticle should not be visible
