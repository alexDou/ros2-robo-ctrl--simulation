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
  Scenario: Reset Fault flushes the cell and restores IDLE readiness
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Given the robot is in "FAULT" state
    When the operator clicks the "Reset Fault" button
    Then the connection status should indicate "CONNECTED / IDLE"
    And all action buttons should be enabled
    And the Reset Fault button should be disabled

  @conveyor @unit-8.2b
  Scenario: Process feeds one Batch onto the belt and halts it at the PickZone edge
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the 3D robot model should be fully loaded in the WebGL scene
    When the operator clicks the "Fill" button
    Then the hopper should be full
    When the Batch composition is being recorded
    And the operator clicks the "Process" button
    Then the belt surface should be moving
    And the belt should halt with a Batch of 3 to 10 gears inside the PickZone
    And the belt surface should be frozen
    And the hopper should hold the rest of the deck
    And Fill and Process should both be disabled

  @conveyor @unit-8.2a
  Scenario: Fill loads the hopper and enables Process
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the 3D robot model should be fully loaded in the WebGL scene
    When the operator clicks the "Fill" button
    Then the hopper should be full
    And Process should be enabled and Fill disabled

  @conveyor @unit-8.2c
  Scenario: Process sorts the whole seeded deck Batch by Batch onto the towers and bin
    Given the mock arm runs 10 times faster
    And the deck seed is 7
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the 3D robot model should be fully loaded in the WebGL scene
    When the operator clicks the "Fill" button
    And the operator clicks the "Process" button
    Then the browser should have sent only cell intents to run the deck
    And the whole deck should be processed
    And every tower counter should read "0/10"
    And the scrap bin should turn red

  @conveyor @unit-8.3a
  Scenario: Stop mid-Batch lets the run end at the PickZone, then Process resumes and finishes the run
    Given the mock arm runs 10 times faster
    And the deck seed is 7
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the 3D robot model should be fully loaded in the WebGL scene
    When the operator clicks the "Fill" button
    And the operator clicks the "Process" button
    And the operator clicks the "Stop" button
    Then the run should be stopped with Fill disabled and Process enabled
    When the operator clicks the "Process" button
    Then the whole deck should be processed
    And every tower counter should read "0/10"

  @conveyor @unit-8.3b
  Scenario: EmergencyStop mid-run then Reset Fault empties the hopper, belt, towers and bin
    Given the mock arm runs 10 times faster
    And the deck seed is 7
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the 3D robot model should be fully loaded in the WebGL scene
    When the operator clicks the "Fill" button
    And the operator clicks the "Process" button
    Then some gears should have been sorted
    When the operator dispatches an EMERGENCY_STOP command
    Then the connection status should indicate "CONNECTED / FAULT"
    When the operator clicks the "Reset Fault" button
    Then the connection status should indicate "CONNECTED / IDLE"
    And the hopper, belt, towers and bin should all be empty

  @conveyor @unit-8.3b
  Scenario: Reloading the page mid-run resets the hopper, belt, towers and bin
    Given the mock arm runs 10 times faster
    And the deck seed is 7
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the 3D robot model should be fully loaded in the WebGL scene
    When the operator clicks the "Fill" button
    And the operator clicks the "Process" button
    Then some gears should have been sorted
    When the operator reloads the page and reconnects
    Then the connection status should indicate "CONNECTED / IDLE"
    And the hopper, belt, towers and bin should all be empty
