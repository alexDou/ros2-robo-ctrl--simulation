@pick-and-place @unit-6.5 @e2e
Feature: Autonomous Pick-and-Place & SpindleTower Stacking Control
  As a robotic workcell operator
  I want to click reachable table positions to trigger autonomous pick-and-place actions
  So that the manipulator grasps gear workpieces, tracks Action progress feedback, stacks gears on the SpindleTower with vertical offsets, and enforces ClickLockout lifecycles under 50ms latency

  @smoke @pick-and-place-loop
  Scenario: Autonomous pick-and-place closed loop from table click through Action progress feedback to SpindleTower deposit
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the 3D robot model should be fully loaded in the WebGL scene
    And the 3D workcell table should be mounted in the WebGL scene
    And the SpindleTower fixture should be mounted in the WebGL scene
    And no active gear should be present in the workspace
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
    And the telemetry latency should remain below 50 ms

  @stacking @multi-gear
  Scenario: Multi-gear stacking stacks subsequent gears with 2cm vertical increment on SpindleTower
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the 3D robot model should be fully loaded in the WebGL scene
    And the SpindleTower fixture should be mounted in the WebGL scene
    When the operator clicks the workcell table at coordinates x 0.50 and y 0.00
    Then the gear should be deposited on the SpindleTower at height 0.00 m
    And the SpindleTower should contain 1 gear
    And the connection status should indicate "CONNECTED / IDLE"
    And clicking the workcell table is unlocked
    When the operator clicks the workcell table at coordinates x 0.45 and y 0.10
    Then clicking the workcell table is locked out
    And the action progress bar should become visible
    And the gear should be deposited on the SpindleTower at height 0.02 m
    And the SpindleTower should contain 2 gears
    And the connection status should indicate "CONNECTED / IDLE"
    And clicking the workcell table is unlocked
    And the telemetry latency should remain below 50 ms

  @lifecycle @clear-stacked-tower
  Scenario: Clearing workspace clears SpindleTower stacked gears and resets tower capacity
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the SpindleTower fixture should be mounted in the WebGL scene
    When the operator clicks the workcell table at coordinates x 0.50 and y 0.00
    Then the SpindleTower should contain 1 gear
    And the connection status should indicate "CONNECTED / IDLE"
    When the operator clicks the "Clear Workspace" button
    Then no active gear should be present in the workspace
    And the SpindleTower should contain 0 gears
    And clicking the workcell table is unlocked
