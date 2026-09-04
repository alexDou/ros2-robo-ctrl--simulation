---
description: "Scaffold a new skill or distill the current terminal session into a reusable skill"
---
1. Parse skill objective from command arguments:
   `$ARGUMENTS`

2. **Extraction Mode Evaluation:**
   - If `$ARGUMENTS` specifies a new topic (e.g., `/create-skill gazebo-sdf-sensor`): Scrape domain knowledge, existing repository patterns, and ROS2/Rust conventions to construct the skill from scratch.
   - If `$ARGUMENTS` is `from-session`: Analyze the recent conversation turns, terminal outputs, and bug fixes to identify the solved problem and distill it into a repeatable recipe.

3. **Scaffolding:**
   - Generate the target directory: `.agents/skills/<skill-name>/`
   - Create `.agents/skills/<skill-name>/SKILL.md` strictly following the schema in `.agents/skills/skill-creator/SKILL.md`.

4. **Frontmatter Verification:**
   - Confirm `name` is valid kebab-case.
   - Confirm `description` is informative and concise.
   - Confirm `triggers` are scoped strictly (no overly broad globs).

5. **Registration & Indexing:**
   - If `.agents/settings.json` enforces an allowlist under `skills.enabled`, append `<skill-name>` to that list.
   - Output the file path and a 3-bullet summary of the newly created skill.

