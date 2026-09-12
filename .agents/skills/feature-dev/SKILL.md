---
name: "feature-dev"
description: "Structured multi-phase feature engineering: discovery, architectural RFC, test-first planning, and execution."
triggers:
  - "/feature*"
  - "implement feature *"
---

# Feature Development Protocol

Never write production code without completing Phases 1 through 3. Every feature must follow this four-phase lifecycle:

```text
Discovery & Grilling ──> Architecture & RFC ──> Verification Plan ──> Phased Execution
```

---

## Phase 1: Discovery & Technical Grilling
Before proposing solutions, aggressively scope requirements:
1. **Domain Boundary Check:**
   - Does this require a new ROS2 topic, service, or action?
   - What are the QoS requirements (`Transient Local` vs. `Volatile`, `Reliable` vs. `Best Effort`)?
   - Does this touch Three.js rendering loops or change REP-103 coordinate conventions?
2. **Clarifying Questions:** Ask up to 3 targeted questions uncovering edge cases, latency budgets, or fallback behavior. Do not proceed until these are answered or explicitly delegated.

---

## Phase 2: Codebase Exploration & Impact Analysis
1. Map affected files using `graphify query` or `rust-analyzer` references.
2. Identify existing traits, types, or messages that can be reused rather than duplicated.
3. Check for performance implications:
   - Does this introduce allocations on hot telemetry paths?
   - Will this block the `rclrs` executor or Three.js `requestAnimationFrame`?

---

## Phase 3: Architectural RFC & Spec
Produce a compact RFC markdown block covering:
* **Interface Contract:** Exact Rust struct/enum definitions, ROS2 `.msg` schemas, or TypeScript interfaces.
* **Data Flow:** ASCII diagram or step-by-step pipeline from publisher/Gazebo to visualizer.
* **Invariants:** What assumptions must hold true (e.g., "joint angles must remain bounded between lower and upper URDF limits").

---

## Phase 4: Test-First Task Matrix
Break implementation into small, atomic tasks adhering to the 3-stage contract-first lifecycle:

* [ ] **Stage 0: Domain Schemas & Wire Contracts First**
  - Lock JSON schemas, coordinate standards, and canonical constants.
  - Regenerate multi-language bindings via `scripts/generate_domain.py`.
  - *Gate:* Cross-language contract serialization tests pass (`pytest`, `cargo nextest`, `vitest`).
* [ ] **Stage 1..N: Subsystem Modules in Isolation**
  - Develop each module (`EdgeNode`, `Gateway`, `TeleopClient`, asset loaders) in isolation against mock boundary ports.
  - *Gate:* Offline unit/component tests pass hermetically for that module.
* [ ] **Stage Final: Connect Everything Together (System Integration)**
  - Multi-service automated E2E test suite (Playwright / Cucumber) orchestrating real processes.
  - *Gate:* End-to-end dataflow verified, real-time timing & latency budget (<50ms) satisfied.


