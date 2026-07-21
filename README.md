<p align="center">
  <img src="ui/favicon.svg" width="96" alt="Minos logo">
</p>

<h1 align="center">Minos</h1>

<p align="center">
  <b>Hard rules for coding agents that hold at minute 1 and at minute 300.</b><br>
  One rule engine, two hosts: Claude Code and OpenCode.
</p>

---

**Tired of Claude adding itself as co-author on every commit? Of the agent
forgetting your AGENTS.md / CLAUDE.md rules an hour into the session?**

Rules that live in the context window get diluted as the session grows. Rules
that live in hooks don't. Minos moves your hard rules out of the model's
memory and into deterministic checks that run on **every** command and edit,
blocking or warning before the action lands.

## Highlights

- **Deterministic first**: keyword and regex rules cost nothing and never drift
- **AI judgment when needed**: `llm-judge` rules ask a model a narrow yes/no
  question, with per-rule model choice (any `claude` or `opencode` model)
- **Global + per-project config**: project rules override by id, and projects
  can disable global rules with an audit reason
- **Web config UI**: rule editor, live test sandbox, judge model picker
- **Agent-configurable**: `/minos:configure block force pushes here` writes
  and verifies the rule for you

## Install

### Claude Code

```
claude plugin marketplace add FlavioZanoni/minos
claude plugin install minos@minos
```

(or interactively: `/plugin` and browse the `minos` marketplace)

This registers `PreToolUse` (Bash) and `PostToolUse` (Edit/Write) hooks plus
the slash commands below.

### OpenCode

No registry needed; Minos installs straight from GitHub as a git dependency.
Two files in your project (or the global equivalents under
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

#### Slash commands in OpenCode (optional)

OpenCode does not load commands from plugins, only from its command
directories, so the enforcement hooks above never register any. To get the
same commands as the Claude Code plugin, copy the OpenCode-ready versions from
this repo into your global command directory:

```
git clone --depth 1 https://github.com/FlavioZanoni/minos /tmp/minos
mkdir -p ~/.config/opencode/commands
cp /tmp/minos/opencode/commands/*.md ~/.config/opencode/commands/
rm -rf /tmp/minos
```

That registers `/minos-configure`, `/minos-explain`, `/minos-global-config`,
and `/minos-project-config` (file name = command name in OpenCode). Use
`.opencode/commands/` inside a project instead of the global directory to
scope them to one repo.

## Config files

Rules live in JSONC (JSON with `//` comments and trailing commas):

| Scope   | Path                          | Wins on conflict |
|---------|-------------------------------|------------------|
| Global  | `~/.config/minos/rules.jsonc` |                  |
| Project | `.minos/rules.jsonc`          | ✔ (override by `id`, or `disable` with a reason) |

See [examples.md](examples.md) for worked examples with field-by-field
explanations.

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
`rules/prefer-existing-tooling.md` there to use it). Inline `promptText` needs
no file at all.

## Editing config

Slash commands:

| Claude Code | OpenCode* | What it does |
|-------------|-----------|--------------|
| `/minos:configure <request>` | `/minos-configure <request>` | Plain-language rule creation: writes the rule to the right scope and verifies it against the real engine |
| `/minos:explain` | `/minos-explain` | Rundown of what Minos does and which rules are active here |
| `/minos:global-config` | `/minos-global-config` | Web UI for `~/.config/minos/rules.jsonc` |
| `/minos:project-config` | `/minos-project-config` | Web UI for the project's `.minos/rules.jsonc` |

\* OpenCode commands are not installed automatically; copy them in first, see
[Slash commands in OpenCode](#slash-commands-in-opencode-optional).

The web UI can also be launched directly, from anywhere:

```
minos config --global
minos config --project

# or without installing anything:
npx github:FlavioZanoni/minos config --project
```

It starts a server on `127.0.0.1` (random free port), prints its URL, and
opens your browser: rule list with source tags, per-rule editor, a live test
sandbox to see which rules fire on a sample command or edit, and the judge
model picker fed by your actual installed CLIs.
