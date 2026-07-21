# Minos

**Tired of Claude adding itself as co-author on every commit? Of the agent
forgetting your AGENTS.md / CLAUDE.md rules an hour into the session?**

Rules that live in the context window get diluted as the session grows. Rules
that live in hooks don't. Minos moves your hard rules out of the model's
memory and into deterministic checks that run on **every** command and edit:
minute 1 or minute 300, same enforcement.

Minos hooks into the agent's tool calls (edits, writes, shell commands)
and checks them against your rules (substring match, regex match, or an
LLM-judge call), blocking or warning before the action lands.

## Install (Claude Code plugin)

```
claude plugin marketplace add FlavioZanoni/minos
claude plugin install minos@minos
```

(assumes the GitHub repo is named `minos`; if it still has an older name,
rename it on GitHub - old URLs redirect automatically)

(or interactively: `/plugin` → browse the `minos` marketplace)

This registers `PreToolUse` (Bash) and `PostToolUse` (Edit/Write) hooks that
run `minos` under the hood, plus the slash commands below.

## Config files

Rules live in JSONC (JSON with `//` comments and trailing commas):

- Global: `~/.config/minos/rules.jsonc`
- Project: `.minos/rules.jsonc` (relative to the project root)

Project rules are merged over global rules by `id` (a project rule with the
same id overrides the global one), and a project config can `disable`
specific global rules by id. See [examples.md](examples.md) for a worked
example with a field-by-field explanation.

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
`~/.config/minos/rules/prefer-existing-tooling.md` or
`.minos/rules/prefer-existing-tooling.md`; copy this repo's
`rules/prefer-existing-tooling.md` there to use it).

## Editing config

Two slash commands open a small local web UI for browsing, editing, and
test-driving rules (list view, per-rule editor, and a sandbox to try a rule
against sample input):

- `/global-config`: edit `~/.config/minos/rules.jsonc`
- `/project-config`: edit the current project's `.minos/rules.jsonc`
  (if the short names collide with other commands, use the namespaced form:
  `/minos:global-config`, `/minos:project-config`)
- `/minos:explain`: plain-language rundown of what Minos does and
  which rules are active in the current project
- `/minos:configure <request>`: tell the agent what you want enforced in
  plain language (e.g. `/minos:configure block force pushes here`); it
  writes the rule into the right config file and verifies it against the real
  engine before reporting back

Both just run:

```
minos config --global
minos config --project
```

which starts a server on `127.0.0.1` (random free port), prints its URL, and
opens it in your browser.

## Install (OpenCode plugin)

No registry needed; the plugin installs straight from GitHub as a git
dependency. Two files in your project (or the global equivalents under
`~/.config/opencode/`):

`.opencode/package.json`

```json
{ "dependencies": { "minos": "github:FlavioZanoni/minos" } }
```

`.opencode/plugins/minos.js`

```js
export { MinosPlugin } from "minos/opencode";
```

The adapter maps `tool.execute.before` (bash commands, throws to block) and
`tool.execute.after` (edit/write content checks). Same config files, same
rules, same engine as the Claude Code plugin.

For the config UI without installing anything:

```
npx github:FlavioZanoni/minos config --project
```
