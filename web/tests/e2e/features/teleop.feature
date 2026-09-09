Feature: Distributed Robot Teleoperation
  As a remote operator
  I want to connect to a robot, monitor telemetry, and dispatch commands
  So that I can safely control and verify manipulator operations

  @smoke @teleoperation
  Scenario: Operator connects, clicks Ping, and receives telemetry confirmation
    When the operator opens the teleoperation visualizer for robot "0"
    Then the connection status should indicate "CONNECTED"
    When the operator clicks the Ping button
    Then the event log should contain a "[TELEMETRY]" event with state "IDLE"
    And the EdgeNode ROS2 logger should record receipt of the PING command

  @concurrency @security
  Scenario: Second browser session to the same robot is rejected with conflict
    Given an operator is actively connected to robot "0"
    When another operator attempts to connect to robot "0" in a second browser session
    Then the second session connection status should indicate "CONFLICT"
    And a conflict banner should state "Active session already exists"

  @resilience @diagnostics
  Scenario: Raw malformed frame returns structured error diagnostics without dropping connection
    When the operator opens the teleoperation visualizer for robot "0"
    Then the connection status should indicate "CONNECTED"
    When the operator dispatches a malformed raw payload "INVALID_RAW_NON_JSON_PAYLOAD"
    Then the event log should contain an error diagnostic "SCHEMA_VALIDATION_ERROR" with message "Malformed RobotCommand payload"
    And the connection status should indicate "CONNECTED"
    When the operator clicks the Ping button
    Then the event log should contain a "[TELEMETRY]" event with state "IDLE"
