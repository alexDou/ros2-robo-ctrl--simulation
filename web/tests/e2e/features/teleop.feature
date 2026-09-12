Feature: Distributed Robot Teleoperation
  As a remote operator
  I want to connect to a robot, monitor telemetry, and dispatch commands
  So that I can safely control and verify manipulator operations

  @smoke @telemetry @30hz
  Scenario: Continuous 30 Hz telemetry streaming from mock ROS2 publisher to browser DOM
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    And the telemetry streaming frequency should be approximately 30 Hz
    And the telemetry latency should remain below 50 ms
    And all 6 canonical UR5e joint readouts should update accurately in the DOM
    And the connection verification controls should be removed from the DOM

  @command @ping
  Scenario: Operator dispatches Ping command and receives telemetry confirmation
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    When the operator dispatches a PING command
    Then the event log should contain a "[TELEMETRY]" event with state "IDLE"
    And the EdgeNode ROS2 logger should record receipt of the PING command

  @concurrency @security
  Scenario: Second browser session to the same robot is rejected with conflict
    Given an operator is actively connected to robot "arm-ur5"
    When another operator attempts to connect to robot "arm-ur5" in a second browser session
    Then the second session connection status should indicate "CONFLICT"
    And a conflict banner should state "Active session already exists"

  @resilience @diagnostics
  Scenario: Raw malformed frame returns structured error diagnostics without dropping connection
    When the operator opens the teleoperation visualizer for robot "arm-ur5"
    Then the connection status should indicate "CONNECTED / IDLE"
    When the operator dispatches a malformed raw payload "INVALID_RAW_NON_JSON_PAYLOAD"
    Then the event log should contain an error diagnostic "SCHEMA_VALIDATION_ERROR" with message "Malformed RobotCommand payload"
    And the connection status should indicate "CONNECTED / IDLE"
    And the telemetry streaming frequency should be approximately 30 Hz
