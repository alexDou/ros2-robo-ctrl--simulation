---
description: "Executes an isolated, rigorous code review on uncommitted changes or branch diffs"
---
1. Inspect the workspace status:
   `git diff --staged` (or `git diff main...HEAD` if branch is specified)
2. Switch context to the `code-reviewer` agent.
3. Review the diff strictly against the criteria in `.agents/agents/code-reviewer.md`.
4. Return prioritized findings with concrete, line-level code suggestions.
