use gateway::domain::{parse_robot_topic, robot_command_topic, robot_telemetry_topic};

#[test]
fn test_datafabric_key_expressions() {
    let cmd_topic = robot_command_topic("robot-0").expect("Valid robot ID");
    assert_eq!(cmd_topic, "robot/robot-0/command");

    let tel_topic = robot_telemetry_topic("robot-0").expect("Valid robot ID");
    assert_eq!(tel_topic, "robot/robot-0/telemetry");

    assert_eq!(
        parse_robot_topic("robot/robot-0/command"),
        Some(("robot-0".to_string(), "command"))
    );
    assert_eq!(
        parse_robot_topic("robot/robot-0/telemetry"),
        Some(("robot-0".to_string(), "telemetry"))
    );
    assert_eq!(parse_robot_topic("invalid/topic/structure"), None);
    assert_eq!(parse_robot_topic("robot//command"), None);

    assert!(robot_command_topic("").is_err());
    assert!(robot_command_topic("bad/id").is_err());
}
