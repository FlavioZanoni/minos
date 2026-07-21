---
description: Open the rule-guard config UI for the global rules file
---

Run the Bash command `node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" config --global` **in the background** (the server runs until stopped — a foreground call would hang until timeout and then kill it), then tell the user the URL it prints so they can open it in their browser. Do not run this proactively — it is user-triggered only.
