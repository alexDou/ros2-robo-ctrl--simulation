---
description: "Fetches and audits a remote PR using isolated code-reviewer rules"
---
1. Identify PR number from arguments (e.g. `/pr-review 42`).
2. Fetch PR metadata and diff:
   `gh pr diff <PR_NUMBER>`
3. Fetch PR discussion and comments:
   `gh pr view <PR_NUMBER> --comments`
4. Evaluate changes against `.agents/skills/pr-toolkit/SKILL.md` and `.agents/agents/code-reviewer.md`:
   - Inspect thread-safety and lock-free channels.
   - Verify REP-103 coordinate transforms.
   - Verify ROS2 message QoS compatibility.
5. Provide review output formatted by severity ([P0] Blocker, [P1] Performance, [P2] Suggestion, [Nit]).
6. (Optional) If instructed with `--submit`, post the review using:
   `gh pr review <PR_NUMBER> --comment -b "<review_body>"`

