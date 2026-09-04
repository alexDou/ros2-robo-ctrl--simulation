---
name: "skill-creator"
description: "Authoring, structuring, and optimizing new reusable Agent Skills adhering to the Agent Skills standard."
triggers:
  - "/create-skill *"
  - "create skill *"
  - "author skill *"
---

# Agent Skill Generation Standard

## Core Philosophy
A skill is not a general tutorial or documentation dump. A skill is an **executable operational protocol** for an AI agent. It must contain:
1. **Targeted triggers:** File globs or keywords that strictly scope when the skill enters the agent's context window.
2. **Invariants & Non-negotiables:** Constraints the agent must never violate (e.g., coordinate frames, memory safety, QoS matches).
3. **Concrete code templates:** Idiomatic snippets ready for immediate adaptation.
4. **Failure modes & recovery:** Exact error messages and the mechanical steps to resolve them.

---

## Skill Directory Layout
Every generated skill must live in its own directory under `.agents/skills/`:

```text
.agents/skills/<skill-name>/
├── SKILL.md                 # Primary operational playbook
└── references/              # (Optional) Complex schemas, templates, or scripts
    └── template.rs
```

---

## Frontmatter Schema Requirements
The generated `SKILL.md` must begin with valid YAML frontmatter:

```yaml
---
name: "kebab-case-name"
description: "High-density summary of capability and domain boundaries."
triggers:
  - "path/glob/**/*.{ext}"
  - "slash-command"
  - "domain-keyword"
---
```

### Trigger Hygiene
* **Avoid universal wildcards:** Never use `*` or generic triggers like `code` or `dev`.
* **Path-based triggering:** Bind to relevant file types (e.g., `src/**/*.rs`, `sim/**/*.sdf`, `web/**/*.tsx`).
* **Semantic keywords:** Target specific tooling or frameworks (e.g., `gz topic`, `rclrs::spin`, `urdf-loader`).

---

## Body Composition Template
Structure every generated `SKILL.md` using this exact hierarchy:

1. **Title & Purpose:** Single-sentence operational boundary.
2. **Architecture / Pipeline:** Minimal ASCII diagram or data flow path.
3. **Canonical Implementation Pattern:** A concrete, copy-pasteable, verified code example using workspace defaults.
4. **Hard Invariants:** Bulleted list of safety or architectural rules.
5. **Common Failure Modes:** A table or bulleted list pairing symptoms with mechanical fixes.

