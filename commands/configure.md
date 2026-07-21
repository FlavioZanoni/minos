---
description: Add or change minos rules from a natural-language request
argument-hint: what to enforce, e.g. "block force pushes in this project"
---

The user wants minos configured as follows: **$ARGUMENTS**

Translate that into config changes and apply them. Everything you need is below - do not guess fields.

## Files

- Global (applies everywhere): `~/.config/minos/rules.jsonc`
- Project (this repo only): `.minos/rules.jsonc`

Pick the scope the user implied ("everywhere/always" → global; otherwise default to project). Read the target file first (it may not exist - then create it). Files are JSONC: `//` comments and trailing commas are allowed; when editing, preserve existing entries and comments.

## Schema

```jsonc
{
  "rules": [
    {
      "id": "kebab-case-unique-id",          // required
      "summary": "one-line description",      // optional, shown in the config UI
      "enabled": false,                       // optional: keep the rule in config but skip it; omit = active
      "appliesTo": {
        "tools": ["Bash"],                    // which agent tools: Bash for commands, Edit/Write for file changes; omit = all
        "pathGlob": ["src/**/*.ts"],          // content rules only; ** = any depth, * = within segment; omit = all files
        "commandMatch": ["git commit"]        // command rules only; case-insensitive substrings; omit = all commands
      },
      "trigger": {
        // exactly one of these three shapes:
        // { "type": "contains", "patterns": ["push --force"] }        // case-insensitive literal, any match fires
        // { "type": "regex", "patterns": ["rm\\s+-[a-z]*r[a-z]*f"] }  // JS regex, case-SENSITIVE, any match fires
        // { "type": "llm-judge", "promptText": "yes/no question", "context": "tooling", "model": "..." }
        //   promptText = inline judge prompt (preferred); "prompt": "path.md" = prompt file relative to the
        //   config dir; "context": "tooling" additionally sends the project's discovered scripts/CLIs to the judge;
        //   "model" = per-rule judge model override, omit to inherit the config-level default
      },
      "action": "block",                      // "block" denies the action; "warn" lets it through with a notice
      "message": "shown to the agent when the rule fires - say what to do instead"
    }
  ],
  "disable": ["global-rule-id", { "id": "other-id", "reason": "why" }],  // project file only: turn off global rules here
  "judge": { "model": "claude-haiku-4-5-20251001", "timeoutMs": 30000 }  // default model for llm-judge rules
}
```

Judge model ids route by shape: bare ids (`claude-haiku-4-5-20251001`) run via the
`claude` CLI; `provider/model` ids (`anthropic/claude-haiku-4-5`, `openai/gpt-5`)
run via the `opencode` CLI.

Merge behavior: a project rule with the same `id` as a global rule fully replaces it for this project.

## Rules for writing rules

- Prefer `contains`/`regex` (deterministic, free) over `llm-judge` (slow, costs a model call). Use `llm-judge` only when literal patterns can't express the intent.
- Ship new `llm-judge` rules as `"action": "warn"` first; tell the user to promote to `block` once the false-positive rate looks fine (the `/minos:project-config` UI has a test sandbox for this).
- Always write a `message` that tells the agent what to do *instead*.

## Verify before reporting

Test each new/changed rule through the real engine - pipe a sample that should fire (and one that shouldn't) into:

```
echo '{"event":"command","tool":"Bash","command":"<sample>","cwd":"<project root>"}' | node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" check
```

(for file rules use `{"event":"content","tool":"Write","path":"<sample path>","content":"<sample>","cwd":...}`). Confirm the expected `block`/`warn`/`allow` comes back, then show the user the rule(s) you wrote and the test results. Skip live-testing `llm-judge` rules unless the user asks - they invoke the judge model.
