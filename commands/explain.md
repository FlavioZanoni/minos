---
description: Explain what rule-guard does and how it is configured right now
---

Give the user a short, beginner-friendly explanation of rule-guard. To ground it in reality, first read `${CLAUDE_PLUGIN_ROOT}/README.md`, then read the user's config files if they exist: `~/.config/rule-guard/rules.jsonc` (global) and `.rule-guard/rules.jsonc` (current project).

Cover, in this order:

1. **What it is** (2–3 sentences): rule-guard hooks into every shell command and file edit/write this agent makes and checks them against configured rules — blocking or warning before bad actions land, no matter how long the session gets.
2. **What's active here**: list the currently effective rules for this project in a compact table (rule id, what it catches, warn/block, global or project). Note any global rules the project disables. If no config exists yet, say so and show one minimal example rule.
3. **How to configure**: `/rule-guard:configure <plain-language request>` has the agent write and verify a rule for you; `/global-config` and `/project-config` open a browser UI (rule editor, test sandbox to try commands/edits against the rules, and the judge-model setting for AI-judgment rules). Power users can edit the JSONC files directly — project rules override global ones by id, and `"disable": [...]` turns global rules off per-project.

Keep it under ~30 lines, no raw JSON dumps unless the user asks.
