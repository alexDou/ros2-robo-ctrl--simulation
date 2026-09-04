---
description: "Executes a structured feature development cycle (Grill -> Spec -> Plan -> Execute)"
---
1. Parse feature objective from command arguments:
   `$ARGUMENTS`
2. **Phase 1: Grilling**
   Analyze the feature against existing packages in `src/` and `web/`.
   If any ambiguity exists regarding ROS QoS, coordinate frames, or state synchronization, ask focused questions and wait for user response.
3. **Phase 2: Discovery**
   Inspect relevant AST structures, types, and existing tests using LSP or file inspection.
4. **Phase 3: RFC & Plan Formulation**
   Formulate the architectural design and Phase 4 Task Matrix as specified in `.agents/skills/feature-dev/SKILL.md`.
5. **Approval Gate:**
   Present the RFC and Task Matrix to the user.
   **STOP AND WAIT FOR USER CONFIRMATION.** Do not proceed to implementation until the user approves or adjusts the design.
6. **Phase 4: Phased Execution**
   Execute tasks sequentially, validating each task against its compiler and test gates (`cargo nextest`, `typecheck`).

