<div align="center">

# GearSort Cell

**A web-operated robot sorting cell: simulate it today, wire it to real machines tomorrow.**

`feat/conveyor-flow` · Unit 8 · *conveyor feed (Flow B)*

[`main`](https://github.com/alexDou/ros2-robo-ctrl--simulation/tree/main) ·
**`feat/conveyor-flow`** (you are here) ·
[`feat/conveyor-devices`](https://github.com/alexDou/ros2-robo-ctrl--simulation/tree/feat/conveyor-devices)

</div>

---

## What is this project?

GearSort Cell is a **digital twin of a small factory cell**. A robot arm takes gearwheels off a belt, checks each one, and sorts the good ones by colour into towers. Broken gearwheels are carried off the end of the belt into a scrap bin. You watch and control everything from a web page, with a live 3D view of the cell.

**Purpose of the project**

- Prove a complete, safe path from *browser button* to *robot movement* without any custom C++ code.
- Keep the robot software ready for a **real UR5e arm**: the same ROS2 graph runs on the simulator and on hardware, and only a launch setting changes.
- Show clean engineering: contract-first design, isolated tests per part, and written decision records.

### This branch: the conveyor showcase (Flow B)

The click-to-place table of [`main`](https://github.com/alexDou/ros2-robo-ctrl--simulation/tree/main) is replaced by a **production-style line**:

1. Press **Fill**. The feed hopper loads a shuffled deck of 100 gearwheels: 10 defective, plus 30 white, 30 green and 30 blue good ones.
2. Press **Process**. The belt runs and the hopper drops gearwheels onto it one by one, at random spacing.
3. The belt stops when the first gearwheel reaches the **pick zone** in front of the arm. Those gearwheels form a *batch* (3 to a belt-full).
4. The arm sorts the batch one at a time: good ones go to the tower of their colour. Defective ones are never touched; they fall off the belt end into the scrap bin on the next run.
5. When a tower holds 10 it empties itself. When the hopper is empty a final run clears the belt.

**Stop** pauses safely after the current pick. **Emergency Stop** freezes the arm. Reloading or reconnecting resets everything.

> **Where the logic lives.** In this branch the hopper, belt and batches are simulated *inside the browser* ([ADR 0005](docs/adr/0005-conveyor-branch-client-owned-feed-and-classification.md)). The robot side only knows about gearwheels the browser registers. For ROS2-owned devices, see [`feat/conveyor-devices`](https://github.com/alexDou/ros2-robo-ctrl--simulation/tree/feat/conveyor-devices).

---

## Contents

1. [Branches at a glance](#branches-at-a-glance)
2. [Documentation](#documentation)
3. [Technology stack](#technology-stack)
4. [Hardware used in this branch](#hardware-used-in-this-branch)
5. [Installation](#installation)
6. [Running it](#running-it)
7. [Testing](#testing)

---

## Branches at a glance

| Branch | Flow | Who drives the cell | Hardware in the model |
|---|---|---|---|
| [`main`](https://github.com/alexDou/ros2-robo-ctrl--simulation/tree/main) | **A: click-to-place.** Click the table, a gearwheel appears, the arm sorts it. | Operator clicks | UR5e + suction tool |
| **`feat/conveyor-flow`** | **B: conveyor.** A belt brings batches; the arm sorts them automatically. | The web page (simulated belt) | UR5e + suction tool |
| [`feat/conveyor-devices`](https://github.com/alexDou/ros2-robo-ctrl--simulation/tree/feat/conveyor-devices) | **B on real devices.** Feeder, belt, pallets and bin are ROS2-managed devices. | ROS2 nodes over Modbus TCP | UR5e + feeder, belt, roller lanes, pneumatic bin slide, PLC |

Each branch is self-contained. Exactly one flow per branch, no runtime switch.

---

## Documentation

| Topic | Where |
|---|---|
| Domain vocabulary (Gearwheel, Batch, PickZone, ...) | [`CONTEXT.md`](CONTEXT.md) |
| Roadmap of all units | [`support_files/specs/units.md`](support_files/specs/units.md) |
| **Unit 8 overview** (this branch) | [`support_files/specs/unit8/overview.md`](support_files/specs/unit8/overview.md) |
| Unit 8 layout and decision log | [`support_files/specs/unit8/implementation_wireframe.md`](support_files/specs/unit8/implementation_wireframe.md) |
| Colour sorting and defect inspection (Unit 7) | [`support_files/specs/unit7/overview.md`](support_files/specs/unit7/overview.md) |
| Production ROS2 refactor | [`support_files/specs/unit_refactoring-a/overview.md`](support_files/specs/unit_refactoring-a/overview.md) |
| Technologies | [`support_files/specs/technologies.md`](support_files/specs/technologies.md) |
| Working method | [`support_files/specs/paradigm.md`](support_files/specs/paradigm.md), [`AGENTS.md`](AGENTS.md) |

**Architecture decision records** (`docs/adr/`)

- [0001](docs/adr/0001-defer-gazebo-to-phase4-mock-motion-visualizer.md) Gazebo deferred, mock motion visualiser first
- [0002](docs/adr/0002-in-process-workcell-state-isolation.md) Workcell state isolation
- [0003](docs/adr/0003-analytical-ur5e-ik-and-event-driven-workcell.md) Analytical UR5e inverse kinematics
- [0004](docs/adr/0004-real-robot-ros2-native-architecture-and-gateway-throttling.md) Real-robot ROS2 architecture, 500 Hz to 30 Hz throttling
- [**0005**](docs/adr/0005-conveyor-branch-client-owned-feed-and-classification.md) **Conveyor feed and classification owned by the browser** (this branch)

---

## Technology stack

```
 Browser (TeleopClient)  ──WebSocket──▶  Gateway  ──Zenoh──▶  ROS2 Jazzy (EdgeNode, arm, workcell)
 Preact · Three.js          Rust · Actix        DataFabric     Python · rclpy · ros2_control
 + hopper, belt, batches
```

| Level | Language | Main libraries and tools |
|---|---|---|
| **TeleopClient** (`web/`) | TypeScript | Preact, Vite, Three.js, `urdf-loader`, Zod, Tailwind CSS · Vitest, Cucumber + Playwright · OXC (`oxlint`, `oxfmt`). Also runs the deck, belt and sorting sequencer |
| **Gateway** (`src/gateway/`) | Rust 2021 | Actix-Web, `actix-ws`, Tokio, **Zenoh**, Serde · `cargo nextest`, Clippy |
| **DataFabric** | n/a | Eclipse Zenoh pub/sub with `zenoh-bridge-ros2dds`; keys `robot/{id}/command`, `robot/{id}/telemetry` |
| **Arm control** (`arm_controller`, `robot_bringup`) | Python 3.12 | ROS2 Jazzy `rclpy`, `ros2_control`, Universal Robots driver and description, analytical UR5e IK |
| **Workcell** (`workcell_manager`) | Python | `rclpy`, ROS2 services and actions (`robot_control_interfaces`) |
| **Contracts** (`schemas/`, `src/domain/`) | JSON Schema | One schema set, generated into Python, Rust and TypeScript by `scripts/generate_domain.py` |
| **Tooling** | Bash, Python | `uv`, `colcon`, Semgrep, `beans` issue tracker |

Rates: SIM runs the arm loop at 5 Hz; LIVE runs the UR5e at 500 Hz over RTDE. The Gateway always streams about 30 Hz to the browser. See [`.agents/rules/pipeline-rates.md`](.agents/rules/pipeline-rates.md).

---

## Hardware used in this branch

Everything runs **in simulation**. Only the arm is designed to be real-ready.

| Part | Model | Motors and actuators | Notes |
|---|---|---|---|
| **Robot arm** | Universal Robots **UR5e**, 6 axes, 5 kg payload | 6 integrated joint modules (servo plus gearbox) | Fake hardware in SIM. Physical arm over RTDE at 500 Hz with `use_fake_hardware:=false` |
| **Tool ("DexterousPalm")** | Pneumatic suction gripper | Vacuum ejector and valve | Simulated: a gearwheel attaches to the tool within 15 mm and a grasp command |
| **Feed hopper, conveyor, towers, scrap bin** | Virtual 3D fixtures | none | Browser-simulated. No hardware model is chosen in this branch |

A device-level hardware list (feeder, belt drive, roller lanes, bin slide, PLC) and a cost estimate are in [`feat/conveyor-devices`](https://github.com/alexDou/ros2-robo-ctrl--simulation/tree/feat/conveyor-devices).

---

## Installation

### Operating system and hardware

- **Ubuntu 24.04 LTS** (Noble). Tested on a Linux 7.x desktop. It also runs inside VirtualBox.
- 8 GB RAM minimum, 16 GB recommended, about 15 GB free disk.
- A browser with WebGL 2 (current Chrome, Chromium or Firefox).
- For a real UR5e only: a PREEMPT_RT kernel and a network route to the arm.

### Packages

```bash
# 1. ROS 2 Jazzy (follow https://docs.ros.org/en/jazzy/Installation.html), then:
sudo apt install -y \
  ros-jazzy-desktop ros-jazzy-ur ros-jazzy-ros2-control ros-jazzy-ros2-controllers \
  ros-jazzy-xacro ros-jazzy-robot-state-publisher \
  python3-colcon-common-extensions python3-pytest \
  build-essential git curl

# 2. Rust (1.78 or newer) and Cargo tools
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install zenoh-bridge-ros2dds --locked
cargo install cargo-nextest --locked

# 3. Node.js 20 or newer (Node 24 works) and Python tooling
sudo apt install -y nodejs npm
curl -LsSf https://astral.sh/uv/install.sh | sh        # uv, Python >= 3.12
```

### Get and build the code

```bash
git clone https://github.com/alexDou/ros2-robo-ctrl--simulation.git
cd ros2-robo-ctrl--simulation
git checkout feat/conveyor-flow

# ROS2 workspace (the repo root is the colcon workspace)
source /opt/ros/jazzy/setup.bash
colcon build --symlink-install
source install/setup.bash

# Python deps and web deps
uv sync
npm --prefix web install

# Optional: regenerate cross-language types from schemas/
python3 scripts/generate_domain.py
```

---

## Running it

Open **three terminals** in the repository root, in this order:

```bash
# 1. ROS2: UR5e (fake hardware), workcell and arm controller
./scripts/launch_ros2.sh

# 2. Gateway (also starts zenoh-bridge-ros2dds), listens on :8080
./scripts/launch_gateway.sh

# 3. Web app (Vite dev server)
./scripts/launch_teleop-client.sh
```

Then open **http://localhost:3000** and press **Connect** (the arm needs about 10 seconds to boot).

| Button | Effect |
|---|---|
| **Fill** | Loads the hopper with a 100-gearwheel deck. Enabled only when empty |
| **Process** | Runs the belt; the arm sorts each batch. Needs a filled hopper |
| **Stop** | Freezes the belt and finishes the current pick. Process resumes it |
| **Emergency Stop** | Freezes the arm and ends the session |

Reloading the page or reconnecting resets the cell.

**Going live.** Run `ros2 launch robot_bringup robot_nodes.launch.py use_fake_hardware:=false robot_ip:=<UR5e IP>` instead of `launch_ros2.sh`. The belt and hopper stay virtual in this branch.

---

## Testing

```bash
scripts/verify.sh               # codegen drift, Rust, Python, web, Semgrep
cargo nextest run --workspace   # Gateway
python3 -m pytest src/ros2/workcell_manager/test/ src/ros2/arm_controller/test/
npm --prefix web run test       # unit tests
npm --prefix web run test:e2e   # Cucumber + Playwright, gateway mocked
```

The web end-to-end suite stops at the TeleopClient boundary: it never touches the Gateway, Zenoh or ROS2.

---

## License

MIT. See [`LICENSE`](LICENSE).
