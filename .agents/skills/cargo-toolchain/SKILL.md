---
name: "cargo-toolchain"
description: "Orchestrating modern Cargo operations, virtual workspace synchronization, colcon/ament_cargo interop, and quality audits."
triggers:
  - "Cargo.toml"
  - "**/Cargo.toml"
  - "src/**/*.rs"
  - "cargo *"
---

# Cargo Workspace & Toolchain Orchestrator

## 1. Two-Tier Workspace Topography
The workspace uses a dual-layer manifest strategy to decouple local developer tooling from `colcon` build artifacts:

* **Root Virtual Workspace (`./Cargo.toml`):**
  * Must contain **only** `[workspace]` configuration (no `[package]`).
  * Explicitly lists all Rust leaf packages under `members`.
  * Centralizes compiler/clippy lints (`[workspace.lints]`) and shared dependency versions (`[workspace.dependencies]`).
* **Leaf Package Manifests (`src/<rust_pkg>/Cargo.toml`):**
  * Defines the concrete crate (`[package]`) and exports.
  * Must sit beside `package.xml` in the same directory.
  * Inherits shared dependencies and workspace lints via `workspace = true`.

### Workspace Registration Invariant
Whenever a new Rust package is added to `src/`:
1. Check `src/<new_pkg>/package.xml` has `<build_type>ament_cargo</build_type>`.
2. Append `"src/<new_pkg>"` to `members` in the root `Cargo.toml`.
3. Verify membership: `cargo metadata --format-version 1 --no-deps`.

---

## 2. Manifest Dual-Sync Rule (`Cargo.toml` ⇄ `package.xml`)
When adding or updating dependencies, both manifests must remain synchronized to prevent `rosdep` and CI build failures:

* **ROS Interfaces & Client Libraries:** If adding a ROS crate (e.g., `rclrs`, `sensor_msgs`, `geometry_msgs`), ensure a matching `<depend>` tag is declared in `package.xml`.
* **Pure Rust Crates:** Crates with no ROS C-bindings (e.g., `serde`, `glam`, `crossbeam`) only go into `Cargo.toml`.

```toml
# In leaf Cargo.toml:
[dependencies]
rclrs.workspace = true
sensor_msgs.workspace = true
glam = "0.28"
```
```xml
<!-- In leaf package.xml: -->
<depend>rclrs</depend>
<depend>sensor_msgs</depend>
<!-- Do NOT add glam here -->
```

---

## 3. Toolchain Execution Playbook

### A. Testing via `cargo-nextest`
Use `nextest` for parallel execution and structured isolation. Source the ROS environment before running tests if crates link to `rclrs`:
```bash
# Workspace unit & integration tests
source /opt/ros/$ROS_DISTRO/setup.bash && cargo nextest run --workspace --all-targets

# Isolate a single failing test
cargo nextest run -E 'test(test_coordinate_inversion)' --no-capture
```

### B. Workspace Audits & Dependency Hygiene
* **Dead Dependency Scanning:** Run `cargo machete` to detect unused crates in leaf manifests.
* **Security & License Audits:** Run `cargo deny check` against `deny.toml` to guard against disallowed licenses or vulnerable crates.
* **Linting:** Run `cargo clippy --workspace --all-targets -- -D warnings`.

### C. Colcon vs. Cargo Separation of Concerns
Never run `colcon build` for standard compile-edit-test cycles. Distinguish operational boundaries:

| Task | Command | Reason |
|---|---|---|
| **Syntax / Type Check** | `cargo check --workspace` | Fast (~1-2s), runs via memory caches. |
| **Unit Testing** | `cargo nextest run` | Isolated test runners, readable failure trees. |
| **Full Assembly** | `colcon build --packages-select <pkg>` | Only needed when generating ROS message headers, preparing symlinks in `install/`, or packaging for Gazebo launching. |

---

## 4. Diagnostics & Common Failure Recovery

* **Linking Error (`librcl.so: cannot open shared object file`):**
  * *Cause:* Cargo was executed in a subshell without sourced ROS 2 underlays.
  * *Fix:* Prefix with `source /opt/ros/${ROS_DISTRO:-humble}/setup.bash && cargo ...`.
* **Proc-Macro Target Mismatch:**
  * *Cause:* Discrepancy between host `rustc` and the sysroot targeted by ROS.
  * *Fix:* Run `rustup default stable` and clean the local target directory: `cargo clean -p <crate_name>`.
* **Missing C Library Bindings (`bindgen` / `clang` failures):**
  * *Cause:* Missing underlying ROS C packages.
  * *Fix:* Identify the missing package using `rosdep check --from-paths src --ignore-src` and install with `rosdep install`.
