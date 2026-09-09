---
apply_to: "src/**/*.rs"
---
# Idiomatic Rust Architecture Guidelines

## Invariant Safety vs. Operational Errors
* **Operational Failures (Fallible Path):** 
  * Network I/O, topic deserialization, QoS handshake mismatches, and file reads must return typed domain errors using `thiserror` (for libraries/nodes) or bubble up via `Result<T, E>`.
  * Never silence errors with `.unwrap_or_default()` unless the default value is explicitly valid domain behavior.
* **Invariants & Panic Scenarios:**
  * `.expect("descriptive failure reason")` is completely valid when upholding an unrecoverable internal invariant (e.g., regex compilation on a static string, mutex lock poisoning, or pre-validated array bounds).
  * Lock poisoning: write `mutex.lock().expect("mutex poisoned by failing thread")`. Attempting to recover from a poisoned mutex in a real-time ROS control loop hides broken state.
* **Prototyping & Unit Tests:**
  * `.unwrap()` and `.expect()` are standard in tests, benchmarks, and binary CLI entrypoints.

## Real-Time Constraints & Allocations (ROS2 / Simulation)
* **Zero-Allocation Hot Paths:** Inside subscriber callbacks (`>50 Hz`), avoid heap allocations (`String`, `Vec::clone()`, `Box`).
* **Fixed Buffers:** Use `arrayvec::ArrayVec` or `smallvec::SmallVec` for fixed-capacity sensor vectors (e.g., IMU quaternions, transform chains).
* **Concurrency:** Favor atomics (`std::sync::atomic`) or bounded lock-free channels (`crossbeam-channel`) over heavy `Arc<Mutex<T>>` structures where possible.

## Target Configuration & Pre-Flight Verification
* **Explicit Targets & Cargo Configuration:** When `[[bin]]` or `[lib]` are declared in `Cargo.toml`, explicitly declare `[[test]]` sections for all integration test files in `tests/` so rust-analyzer and Cargo link library dependencies cleanly.
* **All-Target Checking:** Always execute `cargo check --workspace --all-targets` alongside `cargo clippy --workspace --all-targets` and test suites to verify that test binaries, library crates, and examples resolve imports without configuration discrepancies.
