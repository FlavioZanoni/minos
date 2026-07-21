# rule-guard

**Tired of Claude adding itself as co-author on every commit? Of the agent
forgetting your AGENTS.md / CLAUDE.md rules an hour into the session?**

Rules that live in the context window get diluted as the session grows. Rules
that live in hooks don't. rule-guard moves your hard rules out of the model's
memory and into deterministic checks that run on **every** command and edit —
minute 1 or minute 300, same enforcement.

rule-guard hooks into the agent's tool calls (edits, writes, shell commands)
and checks them against your rules — substring match, regex match, or an
LLM-judge call — blocking or warning before the action lands.

## Install (Claude Code plugin)

```
claude plugin marketplace add FlavioZanoni/rule-guard
claude plugin install rule-guard@rule-guard
```

(or interactively: `/plugin` → browse the `rule-guard` marketplace)

This registers `PreToolUse` (Bash) and `PostToolUse` (Edit/Write) hooks that
run `rule-guard` under the hood, plus the slash commands below.

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
