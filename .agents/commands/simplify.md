---
description: "Safely simplifies targeted code or functions using test-driven refactoring"
---
1. Identify target file or function provided in the arguments.
2. Run baseline verification:
   `cargo nextest run -p <pkg>` (or `npm --prefix web test`)
3. Apply simplification guidelines from `.agents/skills/code-simplifier/SKILL.md`:
   - Replace nested branching with guard clauses/early returns.
   - Remove unused abstractions, traits, and wrappers.
4. Run verification to guarantee zero behavioral regressions:
   - Run tests again.
   - Run `cargo clippy --message-format=short` (or web linter).
5. Output a summary showing before/after cyclomatic complexity and line counts.

