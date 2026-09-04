---
name: "code-simplifier"
description: "Reduces cognitive complexity, flattens deep branching, and removes speculative abstractions while maintaining test invariants."
triggers:
  - "/simplify"
  - "refactor *"
---

# Code Simplification Playbook

## Principles of Simplification
* **Eliminate Premature Generalization (YAGNI):** Collapse single-implementation traits, redundant factory functions, and speculative generic parameters (`<T: Trait>`) down to concrete types.
* **Flatten Cyclomatic Complexity:**
  * Replace nested `if / else` blocks with early returns (guard clauses).
  * In Rust, replace deeply nested `match` statements with `let-else` statements, combinators (`and_then`, `map`), or the `?` operator.
  * In TypeScript, avoid excessive ternaries; use discriminated unions and pattern matching patterns.
* **Normalize Data Flow:** Make data move in one direction. Avoid mutable accumulator parameters where an iterator chain (`filter`, `map`, `collect`) expresses the transformation declaratively.
* **Preserve Invariants:** Do not alter public function signatures, coordinate conventions, or serialization outputs.

## Invariant Verification Workflow
Whenever simplifying a file or module:
1. **Pre-flight Check:** Run existing tests to establish a baseline:
   - Rust: `cargo nextest run --workspace`
   - Web: `npm --prefix web run test`
   If tests fail before starting, stop and notify the user.
2. **Apply Transformation:** Simplify the target code in small, focused chunks.
3. **Post-flight Verification:** Re-run the tests. If anything regresses, revert immediately.
4. **Linter Validation:** Ensure changes adhere to workspace lint tables:
   - Rust: `cargo clippy --workspace --all-targets`
   - Web: `npm --prefix web run lint`

