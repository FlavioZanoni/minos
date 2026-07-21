# rule-guard

Deterministic rule enforcement for coding agents. rule-guard hooks into an
agent's tool calls (edits, writes, shell commands) and checks them against a
list of rules — substring match, regex match, or an LLM-judge call — blocking
or warning before the action completes.

## Install (Claude Code plugin)

Add this repo as a Claude Code plugin. It registers `PreToolUse` (Bash) and
`PostToolUse` (Edit/Write) hooks that run `rule-guard` under the hood, plus
two slash commands for editing config.

## Config files

Rules live in JSONC (JSON with `//` comments and trailing commas):

- Global: `~/.config/rule-guard/rules.jsonc`
- Project: `.rule-guard/rules.jsonc` (relative to the project root)

Project rules are merged over global rules by `id` (a project rule with the
same id overrides the global one), and a project config can `disable`
specific global rules by id.

```jsonc
{
  "rules": [
    { "id": "no-chat-context-in-comments",
      "appliesTo": { "tools": ["Edit", "Write"], "pathGlob": ["**/*.md", "**/*.py", "**/*.ts"] },
      "trigger": { "type": "contains", "patterns": ["as discussed", "as mentioned above", "per our conversation"] },
      "action": "block",
      "message": "Comments/docs can't assume the reader has chat context. Rewrite as self-contained." },
    { "id": "no-claude-coauthor",
      "appliesTo": { "tools": ["Bash"], "commandMatch": ["git commit"] },
      "trigger": { "type": "contains", "patterns": ["Co-Authored-By: Claude", "Generated with Claude"] },
      "action": "block",
      "message": "Strip the Co-Authored-By/Generated-with trailer before committing." },
    { "id": "reinventing-the-cli",
      "appliesTo": { "tools": ["Bash"] },
      "trigger": { "type": "llm-judge", "context": "tooling", "prompt": "rules/prefer-existing-tooling.md" },
      "action": "warn" }
  ]
}
```

`llm-judge` `prompt` paths are resolved relative to the directory of the config
file that defines the rule (so the example above expects
`~/.config/rule-guard/rules/prefer-existing-tooling.md` or
`.rule-guard/rules/prefer-existing-tooling.md` — copy this repo's
`rules/prefer-existing-tooling.md` there to use it).

## Editing config

Two slash commands open a small local web UI for browsing, editing, and
test-driving rules (list view, per-rule editor, and a sandbox to try a rule
against sample input):

- `/global-config` — edit `~/.config/rule-guard/rules.jsonc`
- `/project-config` — edit the current project's `.rule-guard/rules.jsonc`
  (if the short names collide with other commands, use the namespaced form:
  `/rule-guard:global-config`, `/rule-guard:project-config`)
- `/rule-guard:explain` — plain-language rundown of what rule-guard does and
  which rules are active in the current project
- `/rule-guard:configure <request>` — tell the agent what you want enforced in
  plain language (e.g. `/rule-guard:configure block force pushes here`); it
  writes the rule into the right config file and verifies it against the real
  engine before reporting back

Both just run:

```
rule-guard config --global
rule-guard config --project
```

which starts a server on `127.0.0.1` (random free port), prints its URL, and
opens it in your browser.
