---
name: "ros2-rust-rclrs"
description: "Authoring, compiling, and debugging ROS2 nodes in Rust using rclrs and ament_cargo."
triggers:
  - "src/**/*.rs"
  - "**/Cargo.toml"
  - "colcon-cargo"
---

# ROS2 Rust Development Conventions

## Build System Architecture
* Every package must contain both a valid `package.xml` and a `Cargo.toml`.
* The `package.xml` must declare `<build_type>ament_cargo</build_type>`.
* Build invocations must target specific packages: `colcon build --packages-select <pkg_name> --symlink-install`.

## Project File Layout
```text
my_rust_node/
├── Cargo.toml
├── package.xml
└── src/
    └── main.rs
```

## Configuration Files

### `package.xml`
```xml
<?xml version="1.0"?>
<?xml-model href="[http://download.ros.org/schema/package_format3.xsd](http://download.ros.org/schema/package_format3.xsd)" schematypens="[http://www.w3.org/2001/XMLSchema](http://www.w3.org/2001/XMLSchema)"?>
<package format="3">
  <name>rust_sim_bridge</name>
  <version>0.1.0</version>
  <description>Rust ROS2 node for Gazebo telemetry</description>
  <maintainer email="dev@local.net">Developer</maintainer>
  <license>Apache-2.0</license>

  <buildtool_depend>ament_cargo</buildtool_depend>
  <depend>rclrs</depend>
  <depend>std_msgs</depend>
  <depend>sensor_msgs</depend>

  <export>
    <build_type>ament_cargo</build_type>
  </export>
</package>
```

### `Cargo.toml`
```toml
[package]
name = "rust_sim_bridge"
version = "0.1.0"
edition = "2021"

[dependencies]
rclrs = "*"
sensor_msgs = "*"
std_msgs = "*"
```

## Node Implementation Pattern (`src/main.rs`)

```rust
use std::sync::Arc;
use rclrs::{Context, Node, RclrsError, QOS_PROFILE_DEFAULT};
use sensor_msgs::msg::JointState;

fn main() -> Result<(), RclrsError> {
    // Initialize ROS2 execution context
    let context = Context::new(std::env::args())?;
    let node = rclrs::create_node(&context, "rust_sim_bridge")?;

    // Create publisher for downstream telemetry
    let publisher = node.create_publisher::<JointState>("/joint_states", QOS_PROFILE_DEFAULT)?;

    // Create subscriber forwarding Gazebo states
    let _subscription = node.create_subscription::<JointState, _>(
        "/gazebo/joint_states",
        QOS_PROFILE_DEFAULT,
        move |msg: JointState| {
            if let Err(e) = publisher.publish(&msg) {
                eprintln!("Failed to publish joint state: {:?}", e);
            }
        },
    )?;

    // Spin executor loop until termination signal
    rclrs::spin(node)
}
```

## Quality Guardrails
* **Non-blocking Callbacks:** Subscription callbacks must execute quickly without performing disk I/O, heavy transformations, or blocking network operations.
* **Linter Compliance:** All Rust code changes must cleanly pass:
  ```bash
  cargo clippy --workspace --all-targets -D warnings
  ```

