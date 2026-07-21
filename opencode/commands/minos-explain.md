---
description: Explain what Minos does and how it is configured right now
---

Give the user a short, beginner-friendly explanation of Minos, the rule-enforcement plugin active in this session. Ground it in reality: read the user's config files if they exist: `~/.config/minos/rules.jsonc` (global) and `.minos/rules.jsonc` (current project).

Cover, in this order:

1. **What it is** (2-3 sentences): Minos hooks into every shell command and file edit/write this agent makes and checks them against configured rules - blocking or warning before bad actions land, no matter how long the session gets.
2. **What's active here**: list the currently effective rules for this project in a compact table (rule id, what it catches, warn/block, global or project). Note any global rules the project disables and any rules marked `"enabled": false`. If no config exists yet, say so and show one minimal example rule.
3. **How to configure**: `/minos-configure <plain-language request>` has the agent write and verify a rule for you; `npx -y github:FlavioZanoni/minos config --project` (or `--global`) opens a browser UI (rule editor, test sandbox, judge-model picker). Power users can edit the JSONC files directly - project rules override global ones by id, and `"disable": [...]` turns global rules off per-project.

Keep it under ~30 lines, no raw JSON dumps unless the user asks.
