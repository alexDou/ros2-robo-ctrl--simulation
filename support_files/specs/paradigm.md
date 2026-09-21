# Specification-Driven Development (SDD) blueprint.
> [!NOTE] HISTORICAL-SUPERSEDED-BY-6.6.0: `PROCESSING` state refs below are stale. Removed in Unit 6.6.0 (hand-sim-jqtr, e80962b). Contract is BOOTING/STANDBY/IDLE/EXECUTING/FAULT. Kept for history, do not implement.
------------------------------
## AI Agent Execution Directive & Constraints

context:  
  paradigm: Specification-Driven Development (SDD) via Test-Driven Development (TDD)  
  architecture: Domain-Driven Design (DDD), Clean Code, Decoupled Boundaries  
  hardware_constraint: AMD Radeon 780M inside VirtualBox (No NVIDIA Toolkits)  
  target_os: Ubuntu 24.04 LTS (Host/Simulation running natively in VM)  

agent_rules:  
  1_specs_first: Never write implementation code until explicit structural, domain, and data schemas are locked down in a markdown specification.  
  2_tdd_loop: For every phase component, write the automated unit/integration tests FIRST. Implementation is complete ONLY when tests pass.  
  3_decoupling: The Web Gateway (Rust) and AI Node (Python) must communicate via explicit serialization contracts (Serde JSON/Protobuf schemas). No raw ROS2 types may leak past the Python boundary.  
  4_contract_staged_lifecycle: Specifications and tickets MUST follow the 3-stage progression: (Stage 0) Domains, Interfaces & Schemas First -> (Stage 1..N) Subsystem Modules in Isolation against Mock Port Seams -> (Stage Final) Multi-Service System Integration connecting all services.  


------------------------------
## Domain Definitions & Serialization Contracts (DDD Baseline)
To prevent leaky abstractions, the agent must enforce these exact data schemas across the network boundary before initializing development.

```json
{
  "$schema": "https://json-schema.org",
  "title": "RobotTelemetryEvent",
  "type": "object",
  "properties": {
    "timestamp_ns": { "type": "integer" },
    "robot_state": { "type": "string", "enum": ["BOOTING", "IDLE", "PROCESSING", "EXECUTING", "FAULT"] },
    "joint_positions": {
      "type": "array",
      "items": { "type": "number" },
      "minItems": 6,
      "maxItems": 6
    },
    "inference_metrics": {
      "type": "object",
      "properties": {
        "latency_ms": { "type": "number" },
        "confidence": { "type": "number" },
        "detected_object": { "type": "string" }
      },
      "required": ["latency_ms", "confidence", "detected_object"]
    }
  },
  "required": ["timestamp_ns", "robot_state", "joint_positions", "inference_metrics"]
}
```