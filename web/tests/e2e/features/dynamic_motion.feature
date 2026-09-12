@dynamic-motion @unit-3.4 @e2e
Feature: 3D Visualization & Dynamic Kinematic Synchronization
  As a teleoperation engineer
  I want to stream continuous multi-axis sinusoidal motion from EdgeNode to TeleopClient
  So that the 3D WebGL UR5e robot postures and sidebar readouts synchronize dynamically under 50ms latency

  @smoke @visualizer @3d-canvas
  Scenario: Continuous 30 Hz sinusoidal motion drives 3D WebGL robot postures and sidebar readouts
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the telemetry streaming frequency should be approximately 30 Hz
    And the telemetry latency should remain below 50 ms
    And the 3D robot model should be fully loaded in the WebGL scene
    And all 6 canonical UR5e joints should oscillate dynamically within physical limits
    And the 3D visualizer link coordinates should move dynamically in WebGL space
    And the numerical joint angle readouts in the sidebar should update continuously in sync with the 3D canvas

  @performance @stability
  Scenario: Sustained dynamic streaming maintains sub-50ms latency without WebGL memory leaks
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the 3D robot model should be fully loaded in the WebGL scene
    When dynamic motion streams continuously for 3 seconds
    Then the telemetry latency should remain below 50 ms
    And the WebGL renderer should not accumulate geometry or texture memory leaks

  @lifecycle @teardown
  Scenario: TeleopClient cleanly disposes WebGL context and resources upon unmount
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the 3D robot model should be fully loaded in the WebGL scene
    When the operator navigates away from the visualizer
    Then the WebGL visualizer resources should be cleanly disposed
