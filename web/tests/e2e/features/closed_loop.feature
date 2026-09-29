@closed-loop @unit-4.5 @e2e
Feature: Closed-Loop Multi-Service Teleoperation & Safety Control
  As a teleoperation operator
  I want to dispatch the Home pose, verify palm grasp over the wire, and execute safety overrides
  So that the manipulator executes trajectories accurately, reflects actuation visually, and enforces emergency safety invariants under 50ms latency

  @smoke @canned-pose
  Scenario: Commanding Home pose smoothly transitions lifecycle states and positions UR5e in 3D scene
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the 3D robot model should be fully loaded in the WebGL scene
    When the operator clicks the "Home" pose button
    Then the event log should record state transition to "EXECUTING"
    And the event log should record state transition to "IDLE"
    And the 3D robot model should reach the "HOME" pose within 4 seconds
    And the connection status should indicate "CONNECTED / IDLE"
    And the telemetry latency should remain below 50 ms

  @safety @emergency-stop
  Scenario: Triggering Emergency Stop during active motion immediately halts movement and locks toolbar controls
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the 3D robot model should be fully loaded in the WebGL scene
    When the operator clicks the "Home" pose button
    And the robot begins executing trajectory motion
    When the operator dispatches an EMERGENCY_STOP command
    Then the connection status should indicate "CONNECTED / FAULT"
    And the robot motion should halt immediately within 50 ms
    And all action buttons should be disabled
    And the Reset Fault button should be enabled

  @safety @fault-recovery
  Scenario: Reset Fault safely clears fault state and restores IDLE readiness without joint motion
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Given the robot is in "FAULT" state
    When the operator clicks the "Reset Fault" button
    Then the connection status should indicate "CONNECTED / IDLE"
    And all action buttons should be enabled
    And the Reset Fault button should be disabled
    And the robot joint positions should remain unchanged

  @conveyor @tracer-bullet @unit-8.0c
  Scenario: Processing places one sound gear from the belt onto its color tower
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the 3D robot model should be fully loaded in the WebGL scene
    When the operator clicks the "Process" button
    Then the event log should record state transition to "EXECUTING"
    And the event log should record state transition to "IDLE"
    And the sound GREEN gear should rest on the GREEN tower
